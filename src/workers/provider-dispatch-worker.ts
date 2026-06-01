import { simulateProviderResponse } from "../adapters/providers/local-provider-simulator.js";
import { RealProviderAdapter } from "../adapters/providers/real-provider-adapter.js";
import type { HumanReviewTask } from "../domain/human-review/models.js";
import type { ProviderOperationsService } from "../domain/human-review/provider-operations-service.js";
import type { ProviderTaskMappingService } from "../domain/human-review/provider-task-mapping-service.js";
import type { ResponseValidationService } from "../domain/human-review/response-validation-service.js";

export class ProviderDispatchWorker {
  constructor(
    private readonly adapter: RealProviderAdapter,
    private readonly mappingService: ProviderTaskMappingService,
    private readonly operationsService: ProviderOperationsService
  ) {}

  async dispatch(task: HumanReviewTask) {
    const dispatchResult = await this.adapter.dispatch(task);
    await this.mappingService.createMapping({
      reviewTaskId: task.reviewTaskId,
      providerId: task.providerAdapter ?? "real-provider",
      providerTaskId: dispatchResult.providerTaskId,
      providerAssignmentScope: dispatchResult.providerAssignmentScope,
      dispatchStatus: "dispatched"
    });
    this.operationsService.markHealthy(task.providerAdapter ?? "real-provider");

    return dispatchResult;
  }
}

export async function dispatchLocalProviderTask(
  responseValidationService: ResponseValidationService,
  reviewTask: HumanReviewTask
) {
  const simulatedResponse = simulateProviderResponse({ reviewTask });
  await responseValidationService.record(simulatedResponse);
  return simulatedResponse;
}
