import { simulateProviderResponse } from "../adapters/providers/local-provider-simulator.js";
import type { HumanReviewTask } from "../domain/human-review/models.js";
import type { ResponseValidationService } from "../domain/human-review/response-validation-service.js";

export async function dispatchLocalProviderTask(
  responseValidationService: ResponseValidationService,
  reviewTask: HumanReviewTask
) {
  const simulatedResponse = simulateProviderResponse({ reviewTask });
  await responseValidationService.record(simulatedResponse);
  return simulatedResponse;
}
