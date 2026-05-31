import type { QueueMessage } from "../adapters/queue/queue.js";
import type { SelfVerificationResult } from "../domain/self-verification/models.js";
import type { SelfVerificationService } from "../domain/self-verification/self-verification-service.js";

export async function handleSelfVerificationMessage(
  service: SelfVerificationService,
  message: QueueMessage<SelfVerificationResult>
) {
  await service.record(message.payload);
}
