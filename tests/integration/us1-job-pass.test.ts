import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../../src/api/app.js";

describe("US1 high-confidence pass", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    app = buildApp();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("produces a final pass verdict and feedback after the full verification flow", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/verification-jobs",
      payload: {
        acceptance_criteria: [
          {
            criterion_id: "save-visible",
            criticality: "critical",
            evidence_requirements: ["screenshot"],
            human_visible_text: "The save success state is visible"
          }
        ],
        budget_policy: {
          maxJobCost: 10,
          maxAssignments: 2,
          maxRetries: 1
        },
        deadline_at: "2026-06-01T00:00:00.000Z",
        idempotency_key: "pass-flow",
        risk_tier: "low",
        source: {
          repository: "repo",
          commit: "abc123",
          environment: "staging",
          route: "/settings"
        }
      }
    });
    const jobId = createResponse.json().job_id as string;

    await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/artifacts`,
      payload: {
        manifest_id: "manifest-pass",
        job_id: jobId,
        raw_artifacts: [
          {
            artifact_id: "artifact-pass",
            artifact_type: "screenshot",
            content_hash: "hash-pass",
            provenance: "playwright"
          }
        ],
        artifact_quality: "sufficient",
        environment: {
          repository: "repo",
          commit: "abc123",
          environment: "staging",
          route: "/settings"
        }
      }
    });

    await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/privacy-classification`,
      payload: {
        classification_id: "classification-pass",
        job_id: jobId,
        artifact_manifest_id: "manifest-pass",
        data_class: "public",
        redaction_status: "completed",
        policy_version: "v1",
        externalization_decision: "allowed",
        audit_record_id: "audit-pass"
      }
    });

    await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/self-verification-results`,
      payload: {
        result_id: "result-pass",
        job_id: jobId,
        confidence: "high",
        recommended_action: "pass",
        criterion_results: [
          {
            criterion_id: "save-visible",
            status: "pass",
            confidence: "high"
          }
        ]
      }
    });

    const verdictResponse = await app.inject({
      method: "GET",
      url: `/verification-jobs/${jobId}/verdict`
    });
    const feedbackResponse = await app.inject({
      method: "GET",
      url: `/verification-jobs/${jobId}/feedback`
    });
    const jobResponse = await app.inject({
      method: "GET",
      url: `/verification-jobs/${jobId}`
    });

    expect(verdictResponse.json().final_verdict).toBe("pass");
    expect(feedbackResponse.json().final_verdict).toBe("pass");
    expect(jobResponse.json().state).toBe("final_pass");
  });
});
