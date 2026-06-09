import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildProviderTestApp, createProviderEligibleJob } from "../helpers/provider-test-app.js";

describe("provider feedback regression", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = buildProviderTestApp();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("preserves machine-readable feedback after provider-originated adjudication", async () => {
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

    await app.inject({
      method: "POST",
      url: "/provider-callback",
      payload: {
        provider_id: "real-provider",
        provider_task_id: taskPayload.provider_task_id,
        provider_response_id: "provider-feedback",
        reviewer_pseudonymous_id: "provider-reviewer",
        overall_verdict: "unclear",
        criterion_results: [
          {
            criterion_id: "managed-check",
            status: "unclear",
            confidence: "medium"
          }
        ],
        defect_category: "layout",
        evidence_note: "Provider reviewer could not confirm the state.",
        severity: "S2",
        shared_secret: "top-secret"
      }
    });

    await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/consensus`,
      payload: {
        artifact_sufficiency: "sufficient",
        disagreement_level: "high",
        quorum_state: "met",
        recommended_outcome: "unclear",
        review_task_id: taskPayload.review_task_id,
        severity_summary: "S2",
        valid_response_count: 1,
        adjudication_trigger: "provider_disagreement"
      }
    });

    await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/adjudications`,
      payload: {
        decision: "retry",
        trigger_reason: "provider_disagreement"
      }
    });

    const feedbackResponse = await app.inject({
      method: "GET",
      url: `/verification-jobs/${jobId}/feedback`
    });

    expect(feedbackResponse.statusCode).toBe(200);
    expect(feedbackResponse.json()).toMatchObject({
      final_verdict: "retry",
      provider_ids: ["real-provider"],
      provider_response_ids: ["provider-feedback"],
      retry_allowed: true,
      retry_reason: "provider_disagreement"
    });
  });
});

