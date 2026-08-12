import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../../src/api/app.js";

describe("US3 feedback regression contract", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    app = buildApp();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns extended verdict and feedback fields after durable persistence", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/verification-jobs",
      payload: {
        acceptance_criteria: [
          {
            criterion_id: "feedback",
            criticality: "critical",
            evidence_requirements: ["screenshot"],
            human_visible_text: "Feedback fields round-trip"
          }
        ],
        budget_policy: { maxAssignments: 1, maxJobCost: 5, maxRetries: 1 },
        deadline_at: "2026-06-01T00:00:00.000Z",
        idempotency_key: "feedback-regression",
        risk_tier: "low",
        source: {
          repository: "repo",
          commit: "abc123",
          environment: "local",
          route: "/feedback"
        }
      }
    });
    const jobId = create.json<{ job_id: string }>().job_id;

    await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/artifacts`,
      payload: {
        manifest_id: "manifest-feedback",
        job_id: jobId,
        raw_artifacts: [
          {
            artifact_id: "artifact-feedback",
            artifact_type: "screenshot",
            content_hash: "hash-feedback",
            provenance: "playwright"
          }
        ],
        artifact_quality: "sufficient",
        environment: {
          repository: "repo",
          commit: "abc123",
          environment: "local",
          route: "/feedback"
        }
      }
    });
    await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/privacy-classification`,
      payload: {
        classification_id: "classification-feedback",
        job_id: jobId,
        artifact_manifest_id: "manifest-feedback",
        data_class: "public",
        redaction_status: "completed",
        policy_version: "v1",
        externalization_decision: "allowed",
        audit_record_id: "audit-feedback"
      }
    });
    await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/self-verification-results`,
      payload: {
        result_id: "result-feedback",
        job_id: jobId,
        confidence: "medium",
        recommended_action: "retry",
        criterion_results: [
          { criterion_id: "feedback", status: "unclear", confidence: "medium" }
        ],
        failure_categories: ["flaky-ui"]
      }
    });

    const verdict = await app.inject({
      method: "GET",
      url: `/verification-jobs/${jobId}/verdict`
    });
    const feedback = await app.inject({
      method: "GET",
      url: `/verification-jobs/${jobId}/feedback`
    });

    expect(verdict.json()).toMatchObject({
      final_verdict: "retry",
      human_consensus_summary: null,
      adjudication_summary: null
    });
    expect(feedback.json()).toMatchObject({
      agent_next_action: "retry",
      final_verdict: "retry",
      severity: null,
      defect_category: null,
      human_annotations: [],
      machine_check_failures: ["flaky-ui"],
      budget_state: null
    });
  });
});
