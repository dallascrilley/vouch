import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildProviderTestApp,
  createProviderEligibleJob
} from "../helpers/provider-test-app.js";

type CallbackBody = {
  auto_advanced: boolean;
  pairwise_provider_task_id: string | null;
  pairwise_queued: boolean;
  pairwise_review_task_id: string | null;
};

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
    provider_response_id: string;
    overall_verdict: string;
    status: string;
    confidence: string;
    severity: string;
  }> = {}
) {
  return {
    provider_id: "real-provider",
    provider_task_id: providerTaskId,
    provider_response_id:
      overrides.provider_response_id ?? `response-${crypto.randomUUID()}`,
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
    evidence_note: "Pairwise tie-break test callback.",
    severity: overrides.severity ?? "S3",
    shared_secret: "top-secret"
  };
}

describe("provider pairwise tie-break", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = buildProviderTestApp();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("queues and dispatches a pairwise micro-task when responses split without a severe minority", async () => {
    const jobId = await createProviderEligibleJob(app);
    const taskPayload = await createProviderTask(app, jobId);

    const firstCallback = await app.inject({
      method: "POST",
      url: "/provider-callback",
      payload: callbackPayload(taskPayload.provider_task_id, {
        overall_verdict: "unclear",
        status: "unclear"
      })
    });
    expect(firstCallback.json<CallbackBody>()).toMatchObject({
      auto_advanced: false,
      pairwise_queued: false
    });

    const secondCallback = await app.inject({
      method: "POST",
      url: "/provider-callback",
      payload: callbackPayload(taskPayload.provider_task_id, {
        overall_verdict: "pass",
        status: "pass",
        confidence: "high",
        severity: "S4"
      })
    });
    const secondBody = secondCallback.json<CallbackBody>();

    expect(secondCallback.statusCode).toBe(202);
    expect(secondBody).toMatchObject({
      auto_advanced: false,
      pairwise_queued: true
    });
    expect(secondBody.pairwise_review_task_id).toBeTruthy();
    expect(secondBody.pairwise_provider_task_id).toBeTruthy();

    // Job is not terminal: no verdict or feedback yet.
    const feedbackResponse = await app.inject({
      method: "GET",
      url: `/verification-jobs/${jobId}/feedback`
    });
    expect(feedbackResponse.statusCode).toBe(404);

    const inspection = await app.inject({
      method: "GET",
      url: `/runtime/inspection/jobs/${jobId}`
    });
    const body = inspection.json<{ ledger: Array<{ eventType: string }> }>();
    expect(
      body.ledger.some(
        (event) => event.eventType === "verification.provider.pairwise_queued"
      )
    ).toBe(true);
  });

  it("resolves the tie when the pairwise task returns a unanimous pass", async () => {
    const jobId = await createProviderEligibleJob(app);
    const taskPayload = await createProviderTask(app, jobId);

    await app.inject({
      method: "POST",
      url: "/provider-callback",
      payload: callbackPayload(taskPayload.provider_task_id, {
        overall_verdict: "unclear",
        status: "unclear"
      })
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
    const pairwiseProviderTaskId =
      splitCallback.json<CallbackBody>().pairwise_provider_task_id;
    expect(pairwiseProviderTaskId).toBeTruthy();

    const tieBreakCallback = await app.inject({
      method: "POST",
      url: "/provider-callback",
      payload: callbackPayload(pairwiseProviderTaskId as string, {
        overall_verdict: "pass",
        status: "pass",
        confidence: "high",
        severity: "S4"
      })
    });

    const feedbackResponse = await app.inject({
      method: "GET",
      url: `/verification-jobs/${jobId}/feedback`
    });

    expect(tieBreakCallback.json<CallbackBody>()).toMatchObject({
      auto_advanced: true,
      pairwise_queued: false
    });
    expect(feedbackResponse.json()).toMatchObject({
      final_verdict: "pass",
      policy_constraints: ["provider_auto_resolved"]
    });
  });

  it("does not queue pairwise when the split contains a severe minority", async () => {
    const jobId = await createProviderEligibleJob(app);
    const taskPayload = await createProviderTask(app, jobId);

    await app.inject({
      method: "POST",
      url: "/provider-callback",
      payload: callbackPayload(taskPayload.provider_task_id, {
        overall_verdict: "unclear",
        status: "unclear",
        severity: "S2"
      })
    });
    const severeCallback = await app.inject({
      method: "POST",
      url: "/provider-callback",
      payload: callbackPayload(taskPayload.provider_task_id, {
        overall_verdict: "fail",
        status: "fail",
        confidence: "high",
        severity: "S1"
      })
    });
    const severeBody = severeCallback.json<CallbackBody>();

    expect(severeBody).toMatchObject({
      auto_advanced: false,
      pairwise_queued: false
    });

    // The severe-minority path stays on manual consensus -> adjudication.
    const consensusResponse = await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/consensus`,
      payload: {
        artifact_sufficiency: "sufficient",
        disagreement_level: "high",
        quorum_state: "met",
        recommended_outcome: "unclear",
        review_task_id: taskPayload.review_task_id,
        severity_summary: "S1",
        valid_response_count: 2,
        adjudication_trigger: "severe_minority"
      }
    });
    const adjudicationResponse = await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/adjudications`,
      payload: {
        decision: "fail",
        trigger_reason: "severe_minority"
      }
    });

    expect(consensusResponse.statusCode).toBe(202);
    expect(adjudicationResponse.statusCode).toBe(202);
  });

  it("does not queue pairwise for unanimous unclear responses", async () => {
    const jobId = await createProviderEligibleJob(app);
    const taskPayload = await createProviderTask(app, jobId);

    await app.inject({
      method: "POST",
      url: "/provider-callback",
      payload: callbackPayload(taskPayload.provider_task_id, {
        overall_verdict: "unclear",
        status: "unclear"
      })
    });
    const secondCallback = await app.inject({
      method: "POST",
      url: "/provider-callback",
      payload: callbackPayload(taskPayload.provider_task_id, {
        overall_verdict: "unclear",
        status: "unclear"
      })
    });

    expect(secondCallback.json<CallbackBody>()).toMatchObject({
      auto_advanced: false,
      pairwise_queued: false
    });
  });

  it("queues at most one pairwise task per job", async () => {
    const jobId = await createProviderEligibleJob(app);
    const taskPayload = await createProviderTask(app, jobId);

    await app.inject({
      method: "POST",
      url: "/provider-callback",
      payload: callbackPayload(taskPayload.provider_task_id, {
        overall_verdict: "unclear",
        status: "unclear"
      })
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
    expect(splitCallback.json<CallbackBody>().pairwise_queued).toBe(true);

    const thirdCallback = await app.inject({
      method: "POST",
      url: "/provider-callback",
      payload: callbackPayload(taskPayload.provider_task_id, {
        overall_verdict: "fail",
        status: "fail",
        confidence: "medium",
        severity: "S3"
      })
    });

    expect(thirdCallback.json<CallbackBody>()).toMatchObject({
      auto_advanced: false,
      pairwise_queued: false
    });
  });

  it("dispatches the pairwise micro-task when a real spend ceiling is set", async () => {
    await app.close();
    app = buildProviderTestApp({
      env: { VOUCH_REAL_SPEND_CEILING_USD: "5" }
    });
    await app.ready();

    const jobId = await createProviderEligibleJob(app);
    const taskResponse = await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/human-review-tasks`,
      payload: {
        criterion_ids: ["managed-check"],
        deadline_at: "2026-06-01T00:00:00.000Z",
        idempotency_key: `pairwise-ceiling-${jobId}`,
        provider_adapter: "real-provider",
        quality_policy: "provider-managed",
        reviewer_pool: "managed",
        sanitized_package_id: "managed-package",
        task_template: JSON.stringify({
          v: 1,
          instructions: "Check the managed screenshot.",
          params: { criteria: [{ id: "managed-check", statement: "Passes" }] },
          pricing: { max_assignments: 3, reward: "0.10" },
          template_id: "binary_screenshot_check"
        })
      }
    });
    const taskPayload = taskResponse.json<{
      provider_task_id: string;
      review_task_id: string;
    }>();

    await app.inject({
      method: "POST",
      url: "/provider-callback",
      payload: callbackPayload(taskPayload.provider_task_id, {
        overall_verdict: "unclear",
        status: "unclear"
      })
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

    expect(splitCallback.statusCode).toBe(202);
    expect(splitCallback.json<CallbackBody>()).toMatchObject({
      auto_advanced: false,
      pairwise_queued: true
    });
    expect(
      splitCallback.json<CallbackBody>().pairwise_provider_task_id
    ).toBeTruthy();
  });
});
