import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../../src/api/app.js";

describe("US2 severe minority adjudication", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    app = buildApp();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("records adjudication after a severe minority report scenario", async () => {
    const jobResponse = await app.inject({
      method: "POST",
      url: "/verification-jobs",
      payload: {
        acceptance_criteria: [
          {
            criterion_id: "blocking-error",
            criticality: "critical",
            evidence_requirements: ["screenshot"],
            human_visible_text: "No blocking error is present"
          }
        ],
        budget_policy: {
          maxJobCost: 10,
          maxAssignments: 3,
          maxRetries: 1
        },
        deadline_at: "2026-06-01T00:00:00.000Z",
        idempotency_key: crypto.randomUUID(),
        risk_tier: "high",
        source: {
          repository: "repo",
          commit: "abc123",
          environment: "staging",
          route: "/demo"
        }
      }
    });
    const jobId = jobResponse.json().job_id as string;

    await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/artifacts`,
      payload: {
        manifest_id: "manifest-us2-severe",
        job_id: jobId,
        raw_artifacts: [
          {
            artifact_id: "artifact-us2-severe",
            artifact_type: "screenshot",
            content_hash: "hash-us2-severe",
            provenance: "playwright"
          }
        ],
        artifact_quality: "sufficient",
        environment: {
          repository: "repo",
          commit: "abc123",
          environment: "staging",
          route: "/demo"
        }
      }
    });

    await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/privacy-classification`,
      payload: {
        classification_id: "classification-us2-severe",
        job_id: jobId,
        artifact_manifest_id: "manifest-us2-severe",
        data_class: "sensitive_internal",
        redaction_status: "completed",
        policy_version: "v1",
        externalization_decision: "allowed",
        audit_record_id: "audit-us2-severe"
      }
    });

    const taskResponse = await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/human-review-tasks`,
      payload: {
        criterion_ids: ["blocking-error"],
        deadline_at: "2026-06-01T00:00:00.000Z",
        quality_policy: "three-reviewers",
        reviewer_pool: "internal",
        sanitized_package_id: "sanitized-adjudication",
        task_template: "visual-check"
      }
    });
    const reviewTaskId = taskResponse.json().review_task_id as string;

    await app.inject({
      method: "POST",
      url: `/human-review-tasks/${reviewTaskId}/responses`,
      payload: {
        confidence: "high",
        criterion_results: [
          {
            criterion_id: "blocking-error",
            status: "fail",
            confidence: "high"
          }
        ],
        defect_category: "blocking-error",
        evidence_note: "A blocking error is visible.",
        overall_verdict: "fail",
        reviewer_pseudonymous_id: "reviewer-severe",
        severity: "S0"
      }
    });

    await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/consensus`,
      payload: {
        adjudication_trigger: "credible-severe-minority",
        artifact_sufficiency: "sufficient",
        disagreement_level: "high",
        quorum_state: "met",
        recommended_outcome: "adjudicate",
        review_task_id: reviewTaskId,
        severity_summary: "S0",
        valid_response_count: 1
      }
    });

    const adjudicationResponse = await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/adjudications`,
      payload: {
        assigned_pool: "internal",
        decision: "fail",
        trigger_reason: "credible severe minority report"
      }
    });

    const verdictResponse = await app.inject({
      method: "GET",
      url: `/verification-jobs/${jobId}/verdict`
    });

    expect(adjudicationResponse.statusCode).toBe(202);
    expect(verdictResponse.json().final_verdict).toBe("fail");
  });
});
