import type { QueueMessage } from "../adapters/queue/queue.js";
import type { HumanResponse } from "../domain/human-review/models.js";
import type { ResponseValidationService } from "../domain/human-review/response-validation-service.js";

export async function handleProviderIngestionMessage(
  service: ResponseValidationService,
  message: QueueMessage<HumanResponse>
) {
  await service.record(message.payload);
}
