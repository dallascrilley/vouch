import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildProviderTestApp,
  createProviderEligibleJob
} from "../helpers/provider-test-app.js";

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
  return taskResponse.json<{
    provider_task_id: string;
    review_task_id: string;
  }>();
}

function callbackPayload(
  providerTaskId: string,
  overrides: Partial<{
    overall_verdict: string;
    status: string;
    confidence: string;
    severity: string;
  }> = {}
) {
  return {
    provider_id: "real-provider",
    provider_task_id: providerTaskId,
    provider_response_id: `response-${crypto.randomUUID()}`,
    reviewer_pseudonymous_id: "provider-reviewer",
    overall_verdict: overrides.overall_verdict ?? "unclear",
    criterion_results: [
      {
        criterion_id: "managed-check",
        status: overrides.status ?? "unclear",
        confidence: overrides.confidence ?? "medium"
      }
    ],
    defect_category: "layout",
    evidence_note: "Stuck-state test callback.",
    severity: overrides.severity ?? "S3",
    shared_secret: "top-secret"
  };
}

describe("stuck-state before any review is queued", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = buildProviderTestApp();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("does not report a freshly created job as stuck awaiting consensus", async () => {
    // These states used to fall through to the awaiting_consensus catch-all,
    // which told an operator to post consensus for responses that cannot
    // exist yet on a job that is not blocked at all.
    const jobId = await createProviderEligibleJob(app);

    const stuck = await app.inject({
      method: "GET",
      url: `/verification-jobs/${jobId}/stuck-state`
    });

    expect(stuck.json()).toMatchObject({
      stuck: false,
      stuck_reason: null,
      recommended_next_action: "continue_pipeline"
    });
  });
});

describe("stuck-state subscription API", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = buildProviderTestApp();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("reports ambiguous_callback when an unclear callback leaves feedback at 404", async () => {
    const jobId = await createProviderEligibleJob(app);
    const taskPayload = await createProviderTask(app, jobId);

    await app.inject({
      method: "POST",
      url: "/provider-callback",
      payload: callbackPayload(taskPayload.provider_task_id)
    });

    const feedbackResponse = await app.inject({
      method: "GET",
      url: `/verification-jobs/${jobId}/feedback`
    });
    const stuckResponse = await app.inject({
      method: "GET",
      url: `/verification-jobs/${jobId}/stuck-state`
    });

    expect(feedbackResponse.statusCode).toBe(404);
    expect(stuckResponse.statusCode).toBe(200);
    expect(stuckResponse.json()).toMatchObject({
      stuck: true,
      stuck_reason: "ambiguous_callback",
      recommended_next_action: "post_consensus"
    });
  });

  it("reports awaiting_consensus while the review task has no responses", async () => {
    const jobId = await createProviderEligibleJob(app);
    await createProviderTask(app, jobId);

    const stuckResponse = await app.inject({
      method: "GET",
      url: `/verification-jobs/${jobId}/stuck-state`
    });

    expect(stuckResponse.json()).toMatchObject({
      stuck: true,
      stuck_reason: "awaiting_consensus",
      recommended_next_action: "post_consensus"
    });
  });

  it("reports pairwise_pending with the tie-break task id after a split", async () => {
    const jobId = await createProviderEligibleJob(app);
    const taskPayload = await createProviderTask(app, jobId);

    await app.inject({
      method: "POST",
      url: "/provider-callback",
      payload: callbackPayload(taskPayload.provider_task_id)
    });
    const splitCallback = await app.inject({
      method: "POST",
      url: "/provider-callback",
      payload: callbackPayload(taskPayload.provider_task_id, {
        overall_verdict: "pass",
        status: "pass",
        confidence: "high",
        severity: "S4"
      })
    });
    const pairwiseReviewTaskId = splitCallback.json<{
      pairwise_review_task_id: string;
    }>().pairwise_review_task_id;

    const stuckResponse = await app.inject({
      method: "GET",
      url: `/verification-jobs/${jobId}/stuck-state`
    });

    expect(stuckResponse.json()).toMatchObject({
      stuck: true,
      stuck_reason: "pairwise_pending",
      recommended_next_action: "await_pairwise_tie_break",
      pairwise_review_task_id: pairwiseReviewTaskId
    });
  });

  it("reports adjudication_required after consensus escalates", async () => {
    const jobId = await createProviderEligibleJob(app);
    const taskPayload = await createProviderTask(app, jobId);

    await app.inject({
      method: "POST",
      url: "/provider-callback",
      payload: callbackPayload(taskPayload.provider_task_id)
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

    const stuckResponse = await app.inject({
      method: "GET",
      url: `/verification-jobs/${jobId}/stuck-state`
    });

    expect(stuckResponse.json()).toMatchObject({
      stuck: true,
      stuck_reason: "adjudication_required",
      recommended_next_action: "post_adjudication"
    });
  });

  it("reports not stuck once a job auto-advances to a terminal verdict", async () => {
    const jobId = await createProviderEligibleJob(app);
    const taskPayload = await createProviderTask(app, jobId);

    await app.inject({
      method: "POST",
      url: "/provider-callback",
      payload: callbackPayload(taskPayload.provider_task_id, {
        overall_verdict: "pass",
        status: "pass",
        confidence: "high",
        severity: "S4"
      })
    });

    const stuckResponse = await app.inject({
      method: "GET",
      url: `/verification-jobs/${jobId}/stuck-state`
    });

    expect(stuckResponse.json()).toMatchObject({
      stuck: false,
      stuck_reason: null,
      recommended_next_action: "fetch_feedback"
    });
  });
});
