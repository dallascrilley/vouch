import type { ConsensusResult } from "./models.js";
import type {
  ConsensusResultRepository,
  HumanResponseRepository,
  HumanReviewTaskRepository
} from "../../adapters/storage/repositories.js";
import type { TransactionManager } from "../../adapters/storage/transaction-manager.js";
import type { JobService } from "../jobs/job-service.js";
import type { LedgerService } from "../ledger/ledger-service.js";

export class ConsensusService {
  constructor(
    private readonly consensusRepository: ConsensusResultRepository,
    private readonly responseRepository: HumanResponseRepository,
    private readonly reviewTaskRepository: HumanReviewTaskRepository,
    private readonly jobService: JobService,
    private readonly ledgerService: LedgerService,
    private readonly transactionManager: TransactionManager
  ) {}

  async record(result: ConsensusResult): Promise<void> {
    const reviewTask = await this.reviewTaskRepository.findById(
      result.reviewTaskId
    );
    if (!reviewTask) {
      throw new Error(`Human review task not found: ${result.reviewTaskId}`);
    }

    const job = await this.jobService.get(reviewTask.jobId);
    if (!job) {
      throw new Error(`Verification job not found: ${reviewTask.jobId}`);
    }

    const responses = await this.responseRepository.findByReviewTaskId(
      result.reviewTaskId
    );
    if (responses.length === 0) {
      throw new Error("Consensus requires at least one human response");
    }

    const providerIds = [
      ...new Set(
        responses
          .map((response) => response.providerId)
          .filter((value): value is string => Boolean(value))
      )
    ];
    const providerResponseIds = responses
      .map((response) => response.providerResponseId)
      .filter((value): value is string => Boolean(value));
    const providerSummary =
      providerIds.length > 0
        ? `Provider responses from ${providerIds.join(", ")} (${providerResponseIds.length} receipts)`
        : undefined;

    await this.transactionManager.inTransaction(async () => {
      await this.ledgerService.recordStateTransition(
        job.state,
        "consensus_running",
        {
          correlationId: result.consensusId,
          jobId: job.jobId,
          payloadHash: result.consensusId,
          policyVersion: "v1"
        }
      );

      job.state = "consensus_running";
      await this.jobService.save(job);
      await this.consensusRepository.save({
        ...result,
        providerIds,
        providerResponseIds,
        providerSummary
      });
    });
  }
}
