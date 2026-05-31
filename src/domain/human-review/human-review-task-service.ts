import type { HumanReviewTask } from "./models.js";
import type { HumanReviewTaskRepository } from "../../adapters/storage/repositories.js";
import type { JobService } from "../jobs/job-service.js";
import type { LedgerService } from "../ledger/ledger-service.js";
import type { ProviderCapabilityRegistry } from "./provider-capability-registry.js";
import type { ReviewerPoolType } from "../shared/types.js";

type CreateHumanReviewTaskInput = {
  criterionIds: string[];
  deadlineAt: Date;
  jobId: string;
  providerAdapter?: string;
  qualityPolicy: string;
  reviewerPool: ReviewerPoolType;
  sanitizedPackageId: string;
  taskTemplate: string;
};

export class HumanReviewTaskService {
  constructor(
    private readonly reviewTaskRepository: HumanReviewTaskRepository,
    private readonly jobService: JobService,
    private readonly ledgerService: LedgerService,
    private readonly capabilityRegistry: ProviderCapabilityRegistry
  ) {}

  async create(input: CreateHumanReviewTaskInput): Promise<HumanReviewTask> {
    const job = await this.jobService.get(input.jobId);
    if (!job) {
      throw new Error(`Verification job not found: ${input.jobId}`);
    }

    const providerCapability = this.capabilityRegistry.findForPool(input.reviewerPool);
    if (!providerCapability) {
      throw new Error(`No provider capability available for reviewer pool: ${input.reviewerPool}`);
    }

    if (input.sanitizedPackageId.trim().length === 0) {
      throw new Error("Human review tasks require a sanitized package");
    }

    await this.ledgerService.recordStateTransition(job.state, "external_review_queued", {
      correlationId: `review-task:${input.jobId}`,
      jobId: job.jobId,
      payloadHash: input.sanitizedPackageId,
      policyVersion: "v1"
    });

    job.state = "external_review_queued";
    await this.jobService.save(job);

    const reviewTask: HumanReviewTask = {
      reviewTaskId: `review_${crypto.randomUUID()}`,
      jobId: job.jobId,
      criterionIds: input.criterionIds,
      reviewerPool: input.reviewerPool,
      sanitizedPackageId: input.sanitizedPackageId,
      taskTemplate: input.taskTemplate,
      qualityPolicy: input.qualityPolicy,
      paymentPolicy: "standard",
      deadlineAt: input.deadlineAt,
      providerAdapter: input.providerAdapter ?? providerCapability.providerId,
      providerTaskRef: undefined,
      state: "queued"
    };

    await this.reviewTaskRepository.save(reviewTask);
    return reviewTask;
  }
}
