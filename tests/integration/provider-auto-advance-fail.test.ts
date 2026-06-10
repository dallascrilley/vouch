import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildProviderTestApp, createProviderEligibleJob } from "../helpers/provider-test-app.js";

async function createProviderTask(app: FastifyInstance, jobId: string) {
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
  return taskResponse.json<{ provider_task_id: string; review_task_id: string }>();
}

describe("provider auto-advance on unanimous fail", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = buildProviderTestApp();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("auto-advances unanimous high-confidence fail callbacks to final fail", async () => {
    const jobId = await createProviderEligibleJob(app);
    const taskPayload = await createProviderTask(app, jobId);

    const callbackResponse = await app.inject({
      method: "POST",
      url: "/provider-callback",
      payload: {
        provider_id: "real-provider",
        provider_task_id: taskPayload.provider_task_id,
        provider_response_id: "auto-advance-fail",
        reviewer_pseudonymous_id: "provider-reviewer",
        overall_verdict: "fail",
        criterion_results: [{ criterion_id: "managed-check", status: "fail", confidence: "high" }],
        defect_category: "layout",
        evidence_note: "Unanimous fail should auto-advance.",
        severity: "S2",
        shared_secret: "top-secret"
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

    expect(callbackResponse.json()).toMatchObject({ auto_advanced: true });
    expect(feedbackResponse.json()).toMatchObject({
      final_verdict: "fail",
      failed_criteria: ["managed-check"],
      severity: "S2",
      defect_category: "layout",
      retry_allowed: true,
      retry_reason: "provider_unanimous_fail",
      policy_constraints: ["provider_auto_resolved"]
    });
    expect(verdictResponse.json()).toMatchObject({
      final_verdict: "fail",
      max_severity: "S2",
      release_gate_effect: "block"
    });
  });

  it("records auto-resolved ledger event without synthetic consensus or adjudication", async () => {
    const jobId = await createProviderEligibleJob(app);
    const taskPayload = await createProviderTask(app, jobId);

    await app.inject({
      method: "POST",
      url: "/provider-callback",
      payload: {
        provider_id: "real-provider",
        provider_task_id: taskPayload.provider_task_id,
        provider_response_id: "auto-advance-fail-ledger",
        reviewer_pseudonymous_id: "provider-reviewer",
        overall_verdict: "fail",
        criterion_results: [{ criterion_id: "managed-check", status: "fail", confidence: "high" }],
        defect_category: "layout",
        evidence_note: "Unanimous fail should auto-advance.",
        severity: "S2",
        shared_secret: "top-secret"
      }
    });

    const inspection = await app.inject({
      method: "GET",
      url: `/runtime/inspection/jobs/${jobId}`
    });
    const body = inspection.json<{
      adjudication: unknown;
      consensus: unknown;
      ledger: Array<{ eventType: string }>;
    }>();

    expect(body.consensus).toBeNull();
    expect(body.adjudication).toBeNull();
    expect(body.ledger.some((event) => event.eventType === "verification.provider.auto_resolved")).toBe(
      true
    );
    expect(
      body.ledger.some((event) => event.eventType === "job.state.human_responses_received.to.final_fail")
    ).toBe(true);
  });

  it("does not auto-advance fail callbacks with low criterion confidence", async () => {
    const jobId = await createProviderEligibleJob(app);
    const taskPayload = await createProviderTask(app, jobId);

    const callbackResponse = await app.inject({
      method: "POST",
      url: "/provider-callback",
      payload: {
        provider_id: "real-provider",
        provider_task_id: taskPayload.provider_task_id,
        provider_response_id: "auto-advance-fail-low-confidence",
        reviewer_pseudonymous_id: "provider-reviewer",
        overall_verdict: "fail",
        criterion_results: [{ criterion_id: "managed-check", status: "fail", confidence: "medium" }],
        defect_category: "layout",
        evidence_note: "Low confidence fail should stay manual.",
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

  it("does not auto-advance fail callbacks with non-fail criterion statuses", async () => {
    const jobId = await createProviderEligibleJob(app);
    const taskPayload = await createProviderTask(app, jobId);

    const callbackResponse = await app.inject({
      method: "POST",
      url: "/provider-callback",
      payload: {
        provider_id: "real-provider",
        provider_task_id: taskPayload.provider_task_id,
        provider_response_id: "auto-advance-fail-mixed",
        reviewer_pseudonymous_id: "provider-reviewer",
        overall_verdict: "fail",
        criterion_results: [{ criterion_id: "managed-check", status: "unclear", confidence: "high" }],
        defect_category: "layout",
        evidence_note: "Mixed criterion outcomes should stay manual.",
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
