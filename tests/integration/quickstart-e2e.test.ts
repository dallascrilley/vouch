import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../../src/api/app.js";

describe("quickstart end-to-end validation", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    app = buildApp();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("runs the documented quickstart flow from job creation to final pass verdict", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/verification-jobs",
      payload: {
        acceptance_criteria: [
          {
            criterion_id: "quickstart-visible",
            criticality: "critical",
            evidence_requirements: ["screenshot"],
            human_visible_text: "The quickstart state is visible"
          }
        ],
        budget_policy: {
          maxJobCost: 10,
          maxAssignments: 3,
          maxRetries: 1
        },
        deadline_at: "2026-06-01T00:00:00.000Z",
        idempotency_key: "quickstart-e2e",
        risk_tier: "low",
        source: {
          repository: "repo",
          commit: "abc123",
          environment: "staging",
          route: "/quickstart"
        }
      }
    });
    const jobId = createResponse.json().job_id as string;

    await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/artifacts`,
      payload: {
        manifest_id: "manifest-quickstart",
        job_id: jobId,
        raw_artifacts: [
          {
            artifact_id: "artifact-quickstart",
            artifact_type: "screenshot",
            content_hash: "hash-quickstart",
            provenance: "playwright"
          }
        ],
        artifact_quality: "sufficient",
        environment: {
          repository: "repo",
          commit: "abc123",
          environment: "staging",
          route: "/quickstart"
        }
      }
    });

    await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/privacy-classification`,
      payload: {
        classification_id: "classification-quickstart",
        job_id: jobId,
        artifact_manifest_id: "manifest-quickstart",
        data_class: "public",
        redaction_status: "completed",
        policy_version: "v1",
        externalization_decision: "allowed",
        audit_record_id: "audit-quickstart"
      }
    });

    await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/self-verification-results`,
      payload: {
        result_id: "result-quickstart",
        job_id: jobId,
        confidence: "high",
        recommended_action: "pass",
        criterion_results: [
          {
            criterion_id: "quickstart-visible",
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

    expect(verdictResponse.json()).toMatchObject({
      final_verdict: "pass",
      release_gate_effect: "allow"
    });
    expect(feedbackResponse.json()).toMatchObject({
      final_verdict: "pass",
      retry_allowed: false
    });
  });
});
