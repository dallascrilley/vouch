import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../../src/api/app.js";
import { buildProviderTestApp, createProviderEligibleJob } from "../helpers/provider-test-app.js";

type SelfVerificationResponse = {
  escalated: boolean;
  provider_task_id: string | null;
  result_id: string;
  review_task_id: string | null;
};

async function seedClassifiedJob(app: FastifyInstance) {
  const jobResponse = await app.inject({
    method: "POST",
    url: "/verification-jobs",
    payload: {
      acceptance_criteria: [
        {
          criterion_id: "visual-check",
          criticality: "critical",
          evidence_requirements: ["screenshot"],
          human_visible_text: "The visual check passes"
        }
      ],
      budget_policy: { maxJobCost: 10, maxAssignments: 2, maxRetries: 1 },
      deadline_at: "2026-06-01T00:00:00.000Z",
      idempotency_key: crypto.randomUUID(),
      risk_tier: "low",
      source: { repository: "repo", commit: "abc123", environment: "staging", route: "/visual" }
    }
  });
  const jobId = jobResponse.json<{ job_id: string }>().job_id;

  await app.inject({
    method: "POST",
    url: `/verification-jobs/${jobId}/artifacts`,
    payload: {
      manifest_id: `manifest-${jobId}`,
      job_id: jobId,
      raw_artifacts: [
        {
          artifact_id: "artifact-visual",
          artifact_type: "screenshot",
          content_hash: "hash-visual",
          provenance: "playwright"
        }
      ],
      artifact_quality: "sufficient",
      environment: { repository: "repo", commit: "abc123", environment: "staging", route: "/visual" }
    }
  });

  await app.inject({
    method: "POST",
    url: `/verification-jobs/${jobId}/privacy-classification`,
    payload: {
      classification_id: `classification-${jobId}`,
      job_id: jobId,
      artifact_manifest_id: `manifest-${jobId}`,
      data_class: "internal_low",
      redaction_status: "completed",
      allowed_reviewer_routes: ["managed"],
      policy_version: "v1",
      externalization_decision: "allowed",
      audit_record_id: `audit-${jobId}`
    }
  });

  return jobId;
}

function selfVerificationPayload(action: "human_review" | "internal_review", criterionId: string) {
  return {
    result_id: `result-${crypto.randomUUID()}`,
    job_id: "ignored",
    confidence: "low",
    recommended_action: action,
    criterion_results: [{ criterion_id: criterionId, status: "unclear", confidence: "low" }],
    failure_categories: ["visual-ambiguous"]
  };
}

describe("self-verification escalation to human review", () => {
  describe("simulated provider path (no Staging)", () => {
    let app: FastifyInstance;

    beforeEach(async () => {
      app = buildApp();
      await app.ready();
    });

    afterEach(async () => {
      await app.close();
    });

    it("queues a real human package and resolves it through the simulated provider", async () => {
      const jobId = await seedClassifiedJob(app);

      const selfVerification = await app.inject({
        method: "POST",
        url: `/verification-jobs/${jobId}/self-verification-results`,
        payload: selfVerificationPayload("human_review", "visual-check")
      });
      const body = selfVerification.json<SelfVerificationResponse>();

      expect(selfVerification.statusCode).toBe(202);
      expect(body.escalated).toBe(true);
      expect(body.review_task_id).toBeTruthy();

      const verdictResponse = await app.inject({
        method: "GET",
        url: `/verification-jobs/${jobId}/verdict`
      });
      const feedbackResponse = await app.inject({
        method: "GET",
        url: `/verification-jobs/${jobId}/feedback`
      });

      expect(verdictResponse.statusCode).toBe(200);
      expect(verdictResponse.json()).toMatchObject({ final_verdict: "pass" });
      expect(feedbackResponse.json()).toMatchObject({
        final_verdict: "pass",
        policy_constraints: ["provider_auto_resolved"],
        provider_ids: ["local-provider-simulator"]
      });
    });

    it("keeps internal_review queued without simulated dispatch", async () => {
      const jobId = await seedClassifiedJob(app);

      const selfVerification = await app.inject({
        method: "POST",
        url: `/verification-jobs/${jobId}/self-verification-results`,
        payload: selfVerificationPayload("internal_review", "visual-check")
      });
      const body = selfVerification.json<SelfVerificationResponse>();

      expect(body.escalated).toBe(true);

      const verdictResponse = await app.inject({
        method: "GET",
        url: `/verification-jobs/${jobId}/verdict`
      });
      const stuckResponse = await app.inject({
        method: "GET",
        url: `/verification-jobs/${jobId}/stuck-state`
      });

      expect(verdictResponse.statusCode).toBe(404);
      expect(stuckResponse.json()).toMatchObject({
        stuck: true,
        stuck_reason: "awaiting_consensus"
      });
    });
  });

  describe("provider-enabled path (mock dispatch)", () => {
    let app: FastifyInstance;

    beforeEach(async () => {
      app = buildProviderTestApp();
      await app.ready();
    });

    afterEach(async () => {
      await app.close();
    });

    it("dispatches the escalation package and a provider callback finalizes the verdict", async () => {
      const jobId = await createProviderEligibleJob(app);

      const selfVerification = await app.inject({
        method: "POST",
        url: `/verification-jobs/${jobId}/self-verification-results`,
        payload: {
          result_id: `result-${crypto.randomUUID()}`,
          job_id: jobId,
          confidence: "low",
          recommended_action: "human_review",
          criterion_results: [
            { criterion_id: "managed-check", status: "unclear", confidence: "low" }
          ],
          failure_categories: ["managed-ambiguous"]
        }
      });
      const body = selfVerification.json<SelfVerificationResponse>();

      expect(selfVerification.statusCode).toBe(202);
      expect(body.escalated).toBe(true);
      expect(body.provider_task_id).toBeTruthy();

      const callbackResponse = await app.inject({
        method: "POST",
        url: "/provider-callback",
        payload: {
          provider_id: "real-provider",
          provider_task_id: body.provider_task_id,
          provider_response_id: "escalation-callback-pass",
          reviewer_pseudonymous_id: "provider-reviewer",
          overall_verdict: "pass",
          criterion_results: [{ criterion_id: "managed-check", status: "pass", confidence: "high" }],
          defect_category: "none",
          evidence_note: "Human reviewer confirmed the ambiguous criterion.",
          severity: "S4",
          shared_secret: "top-secret"
        }
      });

      const verdictResponse = await app.inject({
        method: "GET",
        url: `/verification-jobs/${jobId}/verdict`
      });

      expect(callbackResponse.json()).toMatchObject({ auto_advanced: true });
      expect(verdictResponse.json()).toMatchObject({
        final_verdict: "pass",
        release_gate_effect: "allow"
      });
    });
  });
});
