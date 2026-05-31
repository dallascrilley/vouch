import type { QueueMessage } from "../adapters/queue/queue.js";
import type { AdjudicationCase } from "../domain/consensus/models.js";
import type { AdjudicationService } from "../domain/adjudication/adjudication-service.js";

export async function handleAdjudicationMessage(
  service: AdjudicationService,
  message: QueueMessage<AdjudicationCase>
) {
  await service.record(message.payload);
}
