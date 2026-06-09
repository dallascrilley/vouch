import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildProviderTestApp, createProviderEligibleJob } from "../helpers/provider-test-app.js";

describe("provider response normalization contract", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = buildProviderTestApp();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("records the receipt before normalizing a provider callback into a human response", async () => {
    const jobId = await createProviderEligibleJob(app);
    const taskResponse = await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/human-review-tasks`,
      payload: {
        criterion_ids: ["managed-check"],
        deadline_at: "2026-06-01T00:00:00.000Z",
        provider_adapter: "real-provider",
        quality_policy: "provider-managed",
        reviewer_pool: "managed",
        sanitized_package_id: "managed-package",
        task_template: "provider-template"
      }
    });
    const taskPayload = taskResponse.json();

    const callbackResponse = await app.inject({
      method: "POST",
      url: "/provider-callback",
      payload: {
        provider_id: "real-provider",
        provider_task_id: taskPayload.provider_task_id,
        provider_response_id: "provider-response-1",
        reviewer_pseudonymous_id: "provider-reviewer",
        overall_verdict: "pass",
        criterion_results: [
          {
            criterion_id: "managed-check",
            status: "pass",
            confidence: "high"
          }
        ],
        defect_category: "none",
        evidence_note: "Managed provider confirmed the criterion.",
        severity: "S4",
        shared_secret: "top-secret"
      }
    });

    const consensusResponse = await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/consensus`,
      payload: {
        artifact_sufficiency: "sufficient",
        disagreement_level: "low",
        quorum_state: "met",
        recommended_outcome: "pass",
        review_task_id: taskPayload.review_task_id,
        severity_summary: "none",
        valid_response_count: 1
      }
    });

    expect(callbackResponse.statusCode).toBe(202);
    expect(consensusResponse.statusCode).toBe(202);
    expect(callbackResponse.json()).toMatchObject({
      provider_response_id: "provider-response-1",
      review_task_id: taskPayload.review_task_id
    });
  });
});

