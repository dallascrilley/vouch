import type { HumanReviewTask, VisualEvidence } from "./models.js";
import type { HumanReviewTaskRepository } from "../../adapters/storage/repositories.js";
import type { TransactionManager } from "../../adapters/storage/transaction-manager.js";
import type { JobService } from "../jobs/job-service.js";
import type { LedgerService } from "../ledger/ledger-service.js";
import type { ProviderCapabilityRegistry } from "./provider-capability-registry.js";
import type { ReviewerPoolType } from "../shared/types.js";

type CreateHumanReviewTaskInput = {
  criterionIds: string[];
  deadlineAt: Date;
  jobId: string;
  idempotencyKey?: string;
  providerAdapter?: string;
  qualityPolicy: string;
  reviewerPool: ReviewerPoolType;
  sanitizedPackageId: string;
  taskTemplate: string;
  visualEvidence?: VisualEvidence;
};

// An idempotency key identifies exactly one review task. Replaying it with
// different parameters used to return the original task and silently ignore
// the mismatch, which let a caller assert one reviewer pool while a different
// pool was already stored and dispatched.
//
// deadlineAt and visualEvidence are deliberately excluded: a legitimate
// dispatch retry may carry a refreshed deadline, and evidence is addressed by
// the sanitized package id that is compared here.
function assertReplayMatches(
  input: CreateHumanReviewTaskInput,
  existing: HumanReviewTask
): void {
  const mismatched: string[] = [];
  if (input.jobId !== existing.jobId) mismatched.push("job_id");
  if (input.reviewerPool !== existing.reviewerPool) {
    mismatched.push("reviewer_pool");
  }
  if (input.sanitizedPackageId !== existing.sanitizedPackageId) {
    mismatched.push("sanitized_package_id");
  }
  if (input.taskTemplate !== existing.taskTemplate) {
    mismatched.push("task_template");
  }
  if (input.qualityPolicy !== existing.qualityPolicy) {
    mismatched.push("quality_policy");
  }
  if (
    input.providerAdapter !== undefined &&
    input.providerAdapter !== existing.providerAdapter
  ) {
    mismatched.push("provider_adapter");
  }
  const requested = [...input.criterionIds].sort();
  const stored = [...existing.criterionIds].sort();
  if (
    requested.length !== stored.length ||
    requested.some((criterionId, index) => criterionId !== stored[index])
  ) {
    mismatched.push("criterion_ids");
  }
  if (mismatched.length > 0) {
    throw new Error(
      `Human review task idempotency key was replayed with different parameters: ${mismatched.join(", ")}`
    );
  }
}

export class HumanReviewTaskService {
  constructor(
    private readonly reviewTaskRepository: HumanReviewTaskRepository,
    private readonly jobService: JobService,
    private readonly ledgerService: LedgerService,
    private readonly capabilityRegistry: ProviderCapabilityRegistry,
    private readonly transactionManager: TransactionManager
  ) {}

  async create(input: CreateHumanReviewTaskInput): Promise<HumanReviewTask> {
    const result = await this.createOrGet(input);
    return result.task;
  }

  async createOrGet(
    input: CreateHumanReviewTaskInput
  ): Promise<{ created: boolean; task: HumanReviewTask }> {
    const job = await this.jobService.get(input.jobId);
    if (!job) {
      throw new Error(`Verification job not found: ${input.jobId}`);
    }

    const providerCapability = this.capabilityRegistry.findForPool(
      input.reviewerPool
    );
    if (!providerCapability) {
      throw new Error(
        `No provider capability available for reviewer pool: ${input.reviewerPool}`
      );
    }

    if (input.sanitizedPackageId.trim().length === 0) {
      throw new Error("Human review tasks require a sanitized package");
    }

    const queueState =
      input.reviewerPool === "internal"
        ? "internal_review_queued"
        : "external_review_queued";

    return this.transactionManager.inTransaction(async () => {
      if (input.idempotencyKey) {
        const existing = await this.reviewTaskRepository.findByIdempotencyKey(
          input.idempotencyKey
        );
        if (existing) {
          assertReplayMatches(input, existing);
          return { created: false, task: existing };
        }
      }
      await this.ledgerService.recordStateTransition(job.state, queueState, {
        correlationId: `review-task:${input.jobId}`,
        jobId: job.jobId,
        payloadHash: input.sanitizedPackageId,
        policyVersion: "v1"
      });

      job.state = queueState;
      await this.jobService.save(job);

      const reviewTask: HumanReviewTask = {
        idempotencyKey: input.idempotencyKey,
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
        state: "queued",
        visualEvidence: input.visualEvidence
      };

      await this.reviewTaskRepository.save(reviewTask);
      return { created: true, task: reviewTask };
    });
  }

  async save(task: HumanReviewTask) {
    await this.reviewTaskRepository.save(task);
    return task;
  }
}
