import { simulateProviderResponse } from "../adapters/providers/local-provider-simulator.js";
import type { HumanReviewTask } from "../domain/human-review/models.js";
import type { ProviderOperationsService } from "../domain/human-review/provider-operations-service.js";
import type { ProviderTaskMappingService } from "../domain/human-review/provider-task-mapping-service.js";
import type { ResponseValidationService } from "../domain/human-review/response-validation-service.js";
import type { RealProviderAdapter } from "../adapters/providers/real-provider-adapter.js";
import {
  ProviderDispatchError,
  type ProviderDispatchResult
} from "../adapters/providers/real-provider-adapter.js";

export class ProviderDispatchWorker {
  private readonly inFlight = new Map<
    string,
    Promise<ProviderDispatchResult>
  >();

  constructor(
    private readonly adapter: RealProviderAdapter,
    private readonly mappingService: ProviderTaskMappingService,
    private readonly operationsService: ProviderOperationsService,
    private readonly providerId: string
  ) {}

  async dispatch(task: HumanReviewTask): Promise<ProviderDispatchResult> {
    const existing = await this.mappingService.findByReviewTaskId(
      task.reviewTaskId
    );
    if (existing) {
      return {
        providerAssignmentScope: existing.providerAssignmentScope,
        providerTaskId: existing.providerTaskId
      };
    }

    const inFlight = this.inFlight.get(task.reviewTaskId);
    if (inFlight) return inFlight;

    const pending = this.dispatchAndRecord(task);
    this.inFlight.set(task.reviewTaskId, pending);
    try {
      return await pending;
    } finally {
      if (this.inFlight.get(task.reviewTaskId) === pending) {
        this.inFlight.delete(task.reviewTaskId);
      }
    }
  }

  private async dispatchAndRecord(
    task: HumanReviewTask
  ): Promise<ProviderDispatchResult> {
    const dispatchResult = await this.adapter.dispatch(task);
    const providerId = task.providerAdapter ?? this.providerId;
    try {
      await this.mappingService.createMapping({
        reviewTaskId: task.reviewTaskId,
        providerId,
        providerTaskId: dispatchResult.providerTaskId,
        providerAssignmentScope: dispatchResult.providerAssignmentScope,
        dispatchStatus: "dispatched"
      });
    } catch (error) {
      throw new ProviderDispatchError(
        "Provider dispatch succeeded but its mapping could not be persisted",
        true,
        { cause: error }
      );
    }
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
