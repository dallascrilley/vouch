import type { FeedbackService } from "../feedback/feedback-service.js";
import type { VerdictService } from "../feedback/verdict-service.js";
import type { JobService } from "../jobs/job-service.js";
import type { LedgerService } from "../ledger/ledger-service.js";
import type { HumanResponse } from "./models.js";
import type { HumanReviewTaskRepository } from "../../adapters/storage/repositories.js";
import type { TransactionManager } from "../../adapters/storage/transaction-manager.js";

export class ProviderWorkflowService {
  constructor(
    private readonly jobService: JobService,
    private readonly ledgerService: LedgerService,
    private readonly verdictService: VerdictService,
    private readonly feedbackService: FeedbackService,
    private readonly reviewTaskRepository: HumanReviewTaskRepository,
    private readonly transactionManager: TransactionManager
  ) {}

  async maybeAutoAdvanceAfterIngest(input: {
    deduplicated: boolean;
    response: HumanResponse | null;
    reviewTaskId: string;
  }): Promise<{ advanced: boolean }> {
    if (input.deduplicated || !input.response) {
      return { advanced: false };
    }

    const reviewTask = await this.reviewTaskRepository.findById(input.reviewTaskId);
    if (!reviewTask?.providerAdapter) {
      return { advanced: false };
    }

    const response = input.response;

    if (response.overallVerdict !== "pass") {
      return { advanced: false };
    }

    if (!response.criterionResults.every((criterion) => criterion.status === "pass")) {
      return { advanced: false };
    }

    const job = await this.jobService.get(reviewTask.jobId);
    if (!job) {
      return { advanced: false };
    }

    const providerId = response.providerId;
    const providerResponseId = response.providerResponseId;
    if (!providerId || !providerResponseId) {
      return { advanced: false };
    }

    await this.transactionManager.inTransaction(async () => {
      await this.ledgerService.recordProviderAutoResolved({
        correlationId: response.responseId,
        jobId: job.jobId,
        overallVerdict: response.overallVerdict,
        payloadHash: response.responseId,
        policyVersion: "v1",
        providerId,
        providerResponseId,
        reviewTaskId: input.reviewTaskId,
        validResponseCount: 1
      });

      const currentJob = await this.jobService.get(job.jobId);
      if (!currentJob) {
        throw new Error(`Verification job not found: ${job.jobId}`);
      }

      const verdict = await this.verdictService.finalize(currentJob, "pass", {
        adjudicationSummary: "Auto-advanced after unanimous provider pass callback",
        humanConsensusSummary: `Single provider response (${providerResponseId}); no human quorum`
      });

      await this.feedbackService.emit(currentJob, verdict, {
        humanAnnotations: response.annotationRefs,
        policyConstraints: ["provider_auto_resolved"],
        providerIds: [providerId],
        providerResponseIds: [providerResponseId],
        retryAllowed: false
      });
    });

    return { advanced: true };
  }
}
