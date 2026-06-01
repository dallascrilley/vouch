import type { HumanReviewTask, ProviderAdapterConfig } from "../../domain/human-review/models.js";
import { redactProviderSecrets } from "../observability/provider-log-redaction.js";

type ProviderDispatchResult = {
  providerAssignmentScope: string;
  providerTaskId: string;
};

type ProviderDispatchBody = {
  callback_url?: string;
  criterion_ids: string[];
  review_task_id: string;
  reviewer_pool: HumanReviewTask["reviewerPool"];
  sanitized_package_id: string;
  task_template: string;
};

export class RealProviderAdapter {
  constructor(
    private readonly config: ProviderAdapterConfig,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async dispatch(task: HumanReviewTask): Promise<ProviderDispatchResult> {
    if (this.config.dispatchMode === "mock") {
      return {
        providerAssignmentScope: this.config.accountScope,
        providerTaskId: `provider_${task.reviewTaskId}`
      };
    }

    if (!this.config.dispatchUrl || !this.config.apiKey) {
      throw new Error("Provider dispatch is missing required configuration");
    }

    const body: ProviderDispatchBody = {
      review_task_id: task.reviewTaskId,
      criterion_ids: task.criterionIds,
      reviewer_pool: task.reviewerPool,
      sanitized_package_id: task.sanitizedPackageId,
      task_template: task.taskTemplate,
      callback_url: this.config.callbackBaseUrl
        ? `${this.config.callbackBaseUrl.replace(/\/$/, "")}/provider-callback`
        : undefined
    };

    const response = await this.fetchImpl(this.config.dispatchUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = redactProviderSecrets(await response.text());
      throw new Error(`Provider dispatch failed: ${response.status} ${errorText}`);
    }

    const payload = (await response.json()) as {
      provider_assignment_scope?: string;
      provider_task_id: string;
    };

    return {
      providerAssignmentScope: payload.provider_assignment_scope ?? this.config.accountScope,
      providerTaskId: payload.provider_task_id
    };
  }
}
