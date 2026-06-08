import type { HumanResponse } from "./models.js";
import type { HumanResponseRepository, HumanReviewTaskRepository } from "../../adapters/storage/repositories.js";
import type { TransactionManager } from "../../adapters/storage/transaction-manager.js";
import type { JobService } from "../jobs/job-service.js";
import type { LedgerService } from "../ledger/ledger-service.js";

export class ResponseValidationService {
  constructor(
    private readonly responseRepository: HumanResponseRepository,
    private readonly reviewTaskRepository: HumanReviewTaskRepository,
    private readonly jobService: JobService,
    private readonly ledgerService: LedgerService,
    private readonly transactionManager: TransactionManager
  ) {}

  async record(response: HumanResponse): Promise<void> {
    if (!response.reviewerPseudonymousId.trim()) {
      throw new Error("Reviewer identifier is required");
    }

    if (response.criterionResults.length === 0) {
      throw new Error("At least one criterion result is required");
    }

    const reviewTask = await this.reviewTaskRepository.findById(response.reviewTaskId);
    if (!reviewTask) {
      throw new Error(`Human review task not found: ${response.reviewTaskId}`);
    }

    const job = await this.jobService.get(reviewTask.jobId);
    if (!job) {
      throw new Error(`Verification job not found: ${reviewTask.jobId}`);
    }

    await this.transactionManager.inTransaction(async () => {
      await this.ledgerService.recordStateTransition(job.state, "human_responses_received", {
        correlationId: response.responseId,
        jobId: job.jobId,
        payloadHash: response.responseId,
        policyVersion: "v1"
      });

      job.state = "human_responses_received";
      reviewTask.state = "responses_received";
      await this.jobService.save(job);
      await this.reviewTaskRepository.save(reviewTask);
      await this.responseRepository.save(response);
    });
  }
}
