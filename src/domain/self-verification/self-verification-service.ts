import type { SelfVerificationResult } from "./models.js";
import type { SelfVerificationResultRepository } from "../../adapters/storage/repositories.js";
import type { TransactionManager } from "../../adapters/storage/transaction-manager.js";
import type { LedgerService } from "../ledger/ledger-service.js";
import type { JobService } from "../jobs/job-service.js";
import type { FeedbackService } from "../feedback/feedback-service.js";
import type { VerdictService } from "../feedback/verdict-service.js";
import type { HumanReviewTaskService } from "../human-review/human-review-task-service.js";
import type { HumanReviewTask } from "../human-review/models.js";

export const SELF_VERIFICATION_ESCALATION_TEMPLATE = JSON.stringify({
  v: 1,
  self_verification_escalation: true,
  pricing: {
    max_assignments: 1,
    reward: "0.05"
  }
});

export type SelfVerificationOutcome = {
  escalated: boolean;
  reviewTask: HumanReviewTask | null;
};

export class SelfVerificationService {
  constructor(
    private readonly resultRepository: SelfVerificationResultRepository,
    private readonly jobService: JobService,
    private readonly ledgerService: LedgerService,
    private readonly verdictService: VerdictService,
    private readonly feedbackService: FeedbackService,
    private readonly transactionManager: TransactionManager,
    private readonly reviewTaskService: HumanReviewTaskService
  ) {}

  async record(
    result: SelfVerificationResult
  ): Promise<SelfVerificationOutcome> {
    const job = await this.jobService.get(result.jobId);
    if (!job) {
      throw new Error(`Verification job not found: ${result.jobId}`);
    }

    return this.transactionManager.inTransaction(async () => {
      await this.ledgerService.recordStateTransition(
        job.state,
        "self_verifying",
        {
          correlationId: result.resultId,
          jobId: job.jobId,
          payloadHash: result.resultId,
          policyVersion: "v1"
        }
      );
      job.state = "self_verifying";
      await this.jobService.save(job);

      await this.resultRepository.save(result);

      await this.ledgerService.recordStateTransition(
        job.state,
        "decision_point",
        {
          correlationId: result.resultId,
          jobId: job.jobId,
          payloadHash: result.resultId,
          policyVersion: "v1"
        }
      );
      job.state = "decision_point";
      await this.jobService.save(job);

      if (
        result.recommendedAction === "human_review" ||
        result.recommendedAction === "internal_review"
      ) {
        const reviewTask = await this.queueHumanReview(result, job.deadlineAt);
        return { escalated: true, reviewTask };
      }

      const resolution = this.resolveAction(result.recommendedAction);
      const verdict = await this.verdictService.finalize(
        job,
        resolution.finalVerdict,
        {
          criterionOutcomes: result.criterionResults,
          machineCheckFailures: result.failureCategories,
          retryRecommendation: resolution.retryRecommendation
        }
      );

      await this.feedbackService.emit(job, verdict, {
        machineCheckFailures: result.failureCategories,
        retryAllowed: resolution.retryAllowed,
        retryReason: resolution.retryReason
      });

      return { escalated: false, reviewTask: null };
    });
  }

  // Queues a real human review task carrying a minimal sanitized package:
  // only the unresolved criteria, referenced by package id — never raw
  // artifacts.
  private async queueHumanReview(
    result: SelfVerificationResult,
    deadlineAt: Date
  ): Promise<HumanReviewTask> {
    const unresolvedCriteria = result.criterionResults
      .filter((criterion) => criterion.status !== "pass")
      .map((criterion) => criterion.criterionId);
    const criterionIds =
      unresolvedCriteria.length > 0
        ? unresolvedCriteria
        : result.criterionResults.map((criterion) => criterion.criterionId);

    return this.reviewTaskService.create({
      criterionIds,
      deadlineAt,
      jobId: result.jobId,
      qualityPolicy: "single-reviewer",
      reviewerPool:
        result.recommendedAction === "internal_review" ? "internal" : "managed",
      sanitizedPackageId: `selfverify-${result.resultId}-package`,
      taskTemplate: SELF_VERIFICATION_ESCALATION_TEMPLATE
    });
  }

  private resolveAction(
    action: Exclude<
      SelfVerificationResult["recommendedAction"],
      "human_review" | "internal_review"
    >
  ) {
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
    }
  }
}
