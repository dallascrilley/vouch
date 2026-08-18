import type {
  HumanReviewTask,
  ProviderAdapterConfig
} from "../../domain/human-review/models.js";
import { redactProviderSecrets } from "../observability/provider-log-redaction.js";

export type ProviderDispatchResult = {
  providerAssignmentScope: string;
  providerTaskId: string;
};

export class ProviderDispatchError extends Error {
  constructor(
    message: string,
    readonly ambiguous: boolean,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "ProviderDispatchError";
  }
}

type ProviderDispatchBody = {
  callback_url?: string;
  criterion_ids: string[];
  idempotency_key: string;
  review_task_id: string;
  reviewer_pool: HumanReviewTask["reviewerPool"];
  sanitized_package_id: string;
  task_template: string;
  visual_evidence?: {
    artifact_id: string;
    caption: string;
    content_hash: string;
    data_url: string;
    viewport: string;
  };
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
      idempotency_key: task.idempotencyKey ?? task.reviewTaskId,
      reviewer_pool: task.reviewerPool,
      sanitized_package_id: task.sanitizedPackageId,
      task_template: task.taskTemplate,
      visual_evidence: task.visualEvidence
        ? {
            artifact_id: task.visualEvidence.artifactId,
            caption: task.visualEvidence.caption,
            content_hash: task.visualEvidence.contentHash,
            data_url: task.visualEvidence.dataUrl,
            viewport: task.visualEvidence.viewport
          }
        : undefined,
      callback_url: this.config.callbackBaseUrl
        ? `${this.config.callbackBaseUrl.replace(/\/$/, "")}/provider-callback`
        : undefined
    };

    let response: Response;
    try {
      response = await this.fetchImpl(this.config.dispatchUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.dispatchTimeoutMs ?? 30_000)
      });
    } catch (error) {
      throw new ProviderDispatchError(
        "Provider dispatch outcome is unknown after the request failed",
        true,
        { cause: error }
      );
    }

    if (!response.ok) {
      const errorText = redactProviderSecrets(await response.text());
      const ambiguous =
        response.status >= 500 ||
        response.headers.get("x-provider-dispatch-ambiguous") === "true";
      throw new ProviderDispatchError(
        `Provider dispatch failed: ${response.status} ${errorText}`,
        ambiguous
      );
    }

    let payload: {
      provider_assignment_scope?: string;
      provider_task_id?: string;
    };
    try {
      payload = (await response.json()) as {
        provider_assignment_scope?: string;
        provider_task_id?: string;
      };
    } catch (error) {
      throw new ProviderDispatchError(
        "Provider accepted dispatch but returned an unreadable response",
        true,
        { cause: error }
      );
    }
    if (!payload.provider_task_id?.trim()) {
      throw new ProviderDispatchError(
        "Provider accepted dispatch but did not return a task identifier",
        true
      );
    }

    return {
      providerAssignmentScope:
        payload.provider_assignment_scope ?? this.config.accountScope,
      providerTaskId: payload.provider_task_id
    };
  }
}
