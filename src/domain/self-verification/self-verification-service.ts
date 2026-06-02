import type { SelfVerificationResult } from "./models.js";
import type { SelfVerificationResultRepository } from "../../adapters/storage/repositories.js";
import type { TransactionManager } from "../../adapters/storage/transaction-manager.js";
import type { LedgerService } from "../ledger/ledger-service.js";
import type { JobService } from "../jobs/job-service.js";
import type { FeedbackService } from "../feedback/feedback-service.js";
import type { VerdictService } from "../feedback/verdict-service.js";

export class SelfVerificationService {
  constructor(
    private readonly resultRepository: SelfVerificationResultRepository,
    private readonly jobService: JobService,
    private readonly ledgerService: LedgerService,
    private readonly verdictService: VerdictService,
    private readonly feedbackService: FeedbackService,
    private readonly transactionManager: TransactionManager
  ) {}

  async record(result: SelfVerificationResult): Promise<void> {
    const job = await this.jobService.get(result.jobId);
    if (!job) {
      throw new Error(`Verification job not found: ${result.jobId}`);
    }

    await this.transactionManager.inTransaction(async () => {
      await this.ledgerService.recordStateTransition(job.state, "self_verifying", {
        correlationId: result.resultId,
        jobId: job.jobId,
        payloadHash: result.resultId,
        policyVersion: "v1"
      });
      job.state = "self_verifying";
      await this.jobService.save(job);

      await this.resultRepository.save(result);

      await this.ledgerService.recordStateTransition(job.state, "decision_point", {
        correlationId: result.resultId,
        jobId: job.jobId,
        payloadHash: result.resultId,
        policyVersion: "v1"
      });
      job.state = "decision_point";
      await this.jobService.save(job);

      const resolution = this.resolveAction(result.recommendedAction);
      const verdict = await this.verdictService.finalize(job, resolution.finalVerdict, {
        criterionOutcomes: result.criterionResults,
        machineCheckFailures: result.failureCategories,
        retryRecommendation: resolution.retryRecommendation
      });

      await this.feedbackService.emit(job, verdict, {
        machineCheckFailures: result.failureCategories,
        retryAllowed: resolution.retryAllowed,
        retryReason: resolution.retryReason
      });
    });
  }

  private resolveAction(action: SelfVerificationResult["recommendedAction"]) {
    switch (action) {
      case "pass":
        return { finalVerdict: "pass" as const, retryAllowed: false };
      case "fail":
        return { finalVerdict: "fail" as const, retryAllowed: false };
      case "retry":
        return {
          finalVerdict: "retry" as const,
          retryAllowed: true,
          retryReason: "Automated verification requested retry",
          retryRecommendation: "retry"
        };
      case "recapture":
        return {
          finalVerdict: "recapture" as const,
          retryAllowed: true,
          retryReason: "Artifact capture was insufficient",
          retryRecommendation: "recapture"
        };
      case "fail_closed":
        return { finalVerdict: "fail_closed" as const, retryAllowed: false };
      case "human_review":
      case "internal_review":
        return {
          finalVerdict: "retry" as const,
          retryAllowed: true,
          retryReason: "Human review queueing not implemented in US1",
          retryRecommendation: "human-review-pending"
        };
    }
  }
}
