import { describe, expect, it, vi } from "vitest";

import { RealProviderAdapter } from "../../src/adapters/providers/real-provider-adapter.js";
import type {
  HumanReviewTask,
  ProviderAdapterConfig
} from "../../src/domain/human-review/models.js";

describe("RealProviderAdapter", () => {
  it("sends optional visual evidence in API dispatch mode", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            provider_assignment_scope: "managed",
            provider_task_id: "hit_visual_123"
          }),
          { status: 202 }
        )
      )
    );
    const adapter = new RealProviderAdapter(makeConfig(), fetchImpl);

    const result = await adapter.dispatch({
      criterionIds: ["hero-cta-no-overlap"],
      deadlineAt: new Date("2026-06-30T00:00:00.000Z"),
      jobId: "job_visual_123",
      paymentPolicy: "standard",
      providerAdapter: "real-provider",
      qualityPolicy: "provider-managed",
      reviewerPool: "managed",
      reviewTaskId: "review_visual_123",
      sanitizedPackageId: "visual-package",
      state: "queued",
      taskTemplate: "Review the embedded screenshot.",
      visualEvidence: {
        artifactId: "artifact-visual-123",
        caption: "Desktop screenshot at 1440x900.",
        contentHash: "sha256-demo",
        dataUrl: "data:image/png;base64,abc123",
        viewport: "1440x900"
      }
    } satisfies HumanReviewTask);

    expect(result).toEqual({
      providerAssignmentScope: "managed",
      providerTaskId: "hit_visual_123"
    });

    const request = fetchImpl.mock.calls[0]?.[1];
    expect(JSON.parse(request?.body as string)).toMatchObject({
      criterion_ids: ["hero-cta-no-overlap"],
      visual_evidence: {
        artifact_id: "artifact-visual-123",
        caption: "Desktop screenshot at 1440x900.",
        content_hash: "sha256-demo",
        data_url: "data:image/png;base64,abc123",
        viewport: "1440x900"
      }
    });
  });
});

function makeConfig(): ProviderAdapterConfig {
  return {
    accountScope: "managed",
    apiKey: "provider-key",
    callbackBaseUrl: "http://broker.test",
    credentialSource: "env",
    dispatchMode: "api",
    dispatchUrl: "http://bridge.test/dispatch",
    enabled: true,
    fallbackProviderId: "internal-reviewer",
    ingestionMode: "callback",
    providerId: "real-provider",
    sharedSecret: "secret"
  };
}
