import { simulateProviderResponse } from "../adapters/providers/local-provider-simulator.js";
import type { HumanReviewTask } from "../domain/human-review/models.js";
import type { ProviderOperationsService } from "../domain/human-review/provider-operations-service.js";
import type { ProviderTaskMappingService } from "../domain/human-review/provider-task-mapping-service.js";
import type { ResponseValidationService } from "../domain/human-review/response-validation-service.js";
import type { RealProviderAdapter } from "../adapters/providers/real-provider-adapter.js";

export class ProviderDispatchWorker {
  constructor(
    private readonly adapter: RealProviderAdapter,
    private readonly mappingService: ProviderTaskMappingService,
    private readonly operationsService: ProviderOperationsService,
    private readonly providerId: string
  ) {}

  async dispatch(task: HumanReviewTask) {
    const dispatchResult = await this.adapter.dispatch(task);
    const providerId = task.providerAdapter ?? this.providerId;
    await this.mappingService.createMapping({
      reviewTaskId: task.reviewTaskId,
      providerId,
      providerTaskId: dispatchResult.providerTaskId,
      providerAssignmentScope: dispatchResult.providerAssignmentScope,
      dispatchStatus: "dispatched"
    });
    this.operationsService.markHealthy(providerId);

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
