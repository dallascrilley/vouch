import type { QueueMessage } from "../adapters/queue/queue.js";
import type { HumanReviewTask } from "../domain/human-review/models.js";
import type { HumanReviewTaskService } from "../domain/human-review/human-review-task-service.js";

export async function handleEscalationMessage(
  service: HumanReviewTaskService,
  message: QueueMessage<
    Omit<HumanReviewTask, "reviewTaskId" | "state" | "paymentPolicy">
  >
) {
  await service.create({
    criterionIds: message.payload.criterionIds,
    deadlineAt: message.payload.deadlineAt,
    jobId: message.payload.jobId,
    providerAdapter: message.payload.providerAdapter,
    qualityPolicy: message.payload.qualityPolicy,
    reviewerPool: message.payload.reviewerPool,
    sanitizedPackageId: message.payload.sanitizedPackageId,
    taskTemplate: message.payload.taskTemplate
  });
}
