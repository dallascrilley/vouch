import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildProviderTestApp, createProviderEligibleJob } from "../helpers/provider-test-app.js";

describe("provider disagreement regression", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = buildProviderTestApp();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("preserves adjudication behavior after a provider-originated disagreement", async () => {
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
        provider_response_id: "provider-response-disagree",
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
    // Ambiguous provider signals stay manual: no synthetic auto-resolution.
    expect(callbackResponse.json()).toMatchObject({ auto_advanced: false });

    const consensusResponse = await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/consensus`,
      payload: {
        adjudication_trigger: "provider_disagreement",
        artifact_sufficiency: "sufficient",
        disagreement_level: "medium",
        quorum_state: "met",
        recommended_outcome: "adjudicate",
        review_task_id: taskPayload.review_task_id,
        severity_summary: "S2",
        valid_response_count: 1
      }
    });
    const adjudicationResponse = await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/adjudications`,
      payload: {
        assigned_pool: "internal",
        decision: "retry",
        trigger_reason: "provider reviewer could not confirm the state"
      }
    });

    const feedbackResponse = await app.inject({
      method: "GET",
      url: `/verification-jobs/${jobId}/feedback`
    });
    const verdictResponse = await app.inject({
      method: "GET",
      url: `/verification-jobs/${jobId}/verdict`
    });

    expect(consensusResponse.statusCode).toBe(202);
    expect(adjudicationResponse.statusCode).toBe(202);
    expect(feedbackResponse.json()).toMatchObject({
      final_verdict: "retry",
      provider_ids: ["real-provider"],
      provider_response_ids: ["provider-response-disagree"]
    });
    expect(verdictResponse.json()).toMatchObject({
      final_verdict: "retry"
    });
  });
});

