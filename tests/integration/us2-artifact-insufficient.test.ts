import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../../src/api/app.js";

describe("US2 artifact-insufficient human response", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    app = buildApp();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("accepts an artifact-insufficient response and records an adjudication-ready consensus", async () => {
    const jobResponse = await app.inject({
      method: "POST",
      url: "/verification-jobs",
      payload: {
        acceptance_criteria: [
          {
            criterion_id: "checkout-visible",
            criticality: "critical",
            evidence_requirements: ["screenshot"],
            human_visible_text: "The checkout state is visible"
          }
        ],
        budget_policy: {
          maxJobCost: 10,
          maxAssignments: 3,
          maxRetries: 1
        },
        deadline_at: "2026-06-01T00:00:00.000Z",
        idempotency_key: crypto.randomUUID(),
        risk_tier: "medium",
        source: {
          repository: "repo",
          commit: "abc123",
          environment: "staging",
          route: "/checkout"
        }
      }
    });
    const jobId = jobResponse.json().job_id as string;

    await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/artifacts`,
      payload: {
        manifest_id: "manifest-us2-artifact",
        job_id: jobId,
        raw_artifacts: [
          {
            artifact_id: "artifact-us2-artifact",
            artifact_type: "screenshot",
            content_hash: "hash-us2-artifact",
            provenance: "playwright"
          }
        ],
        artifact_quality: "sufficient",
        environment: {
          repository: "repo",
          commit: "abc123",
          environment: "staging",
          route: "/checkout"
        }
      }
    });

    await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/privacy-classification`,
      payload: {
        classification_id: "classification-us2-artifact",
        job_id: jobId,
        artifact_manifest_id: "manifest-us2-artifact",
        data_class: "sensitive_internal",
        redaction_status: "completed",
        policy_version: "v1",
        externalization_decision: "allowed",
        audit_record_id: "audit-us2-artifact"
      }
    });

    const taskResponse = await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/human-review-tasks`,
      payload: {
        criterion_ids: ["checkout-visible"],
        deadline_at: "2026-06-01T00:00:00.000Z",
        quality_policy: "three-reviewers",
        reviewer_pool: "internal",
        sanitized_package_id: "sanitized-insufficient",
        task_template: "visual-check"
      }
    });
    const reviewTaskId = taskResponse.json().review_task_id as string;

    const responseIngest = await app.inject({
      method: "POST",
      url: `/human-review-tasks/${reviewTaskId}/responses`,
      payload: {
        confidence: "high",
        criterion_results: [
          {
            criterion_id: "checkout-visible",
            status: "unclear",
            confidence: "high"
          }
        ],
        defect_category: "artifact-issue",
        evidence_note: "The screenshot is too redacted to determine the outcome.",
        overall_verdict: "artifact_insufficient",
        reviewer_pseudonymous_id: "reviewer-artifact",
        severity: "S2"
      }
    });

    const consensusResponse = await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/consensus`,
      payload: {
        adjudication_trigger: "artifact-insufficient",
        artifact_sufficiency: "insufficient",
        disagreement_level: "medium",
        quorum_state: "met",
        recommended_outcome: "adjudicate",
        review_task_id: reviewTaskId,
        severity_summary: "S2",
        valid_response_count: 1
      }
    });

    expect(responseIngest.statusCode).toBe(202);
    expect(consensusResponse.statusCode).toBe(202);
  });
});
