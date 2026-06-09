import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildProviderTestApp, createProviderEligibleJob } from "../helpers/provider-test-app.js";

describe("provider auto-advance", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = buildProviderTestApp();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("auto-advances pass callbacks to final pass without manual consensus posts", async () => {
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
    const taskPayload = taskResponse.json<{ provider_task_id: string; review_task_id: string }>();

    const callbackResponse = await app.inject({
      method: "POST",
      url: "/provider-callback",
      payload: {
        provider_id: "real-provider",
        provider_task_id: taskPayload.provider_task_id,
        provider_response_id: "auto-advance-pass",
        reviewer_pseudonymous_id: "provider-reviewer",
        overall_verdict: "pass",
        criterion_results: [{ criterion_id: "managed-check", status: "pass", confidence: "high" }],
        defect_category: "none",
        evidence_note: "Pass path should auto-advance.",
        severity: "S4",
        shared_secret: "top-secret"
      }
    });

    const feedbackResponse = await app.inject({
      method: "GET",
      url: `/verification-jobs/${jobId}/feedback`
    });

    expect(callbackResponse.json()).toMatchObject({ auto_advanced: true });
    expect(feedbackResponse.json()).toMatchObject({ final_verdict: "pass" });
  });

  it("does not auto-advance unclear callbacks", async () => {
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
    const taskPayload = taskResponse.json<{ provider_task_id: string }>();

    const callbackResponse = await app.inject({
      method: "POST",
      url: "/provider-callback",
      payload: {
        provider_id: "real-provider",
        provider_task_id: taskPayload.provider_task_id,
        provider_response_id: "auto-advance-unclear",
        reviewer_pseudonymous_id: "provider-reviewer",
        overall_verdict: "unclear",
        criterion_results: [{ criterion_id: "managed-check", status: "unclear", confidence: "medium" }],
        defect_category: "layout",
        evidence_note: "Unclear should stay manual.",
        severity: "S2",
        shared_secret: "top-secret"
      }
    });

    const feedbackResponse = await app.inject({
      method: "GET",
      url: `/verification-jobs/${jobId}/feedback`
    });

    expect(callbackResponse.json()).toMatchObject({ auto_advanced: false });
    expect(feedbackResponse.statusCode).toBe(404);
  });
});
