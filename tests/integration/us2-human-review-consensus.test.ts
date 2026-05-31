import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../../src/api/app.js";

describe("US2 safe external human review and consensus", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    app = buildApp();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("creates a public review task, ingests a response, and records consensus without raw artifact exposure", async () => {
    const jobResponse = await app.inject({
      method: "POST",
      url: "/verification-jobs",
      payload: {
        acceptance_criteria: [
          {
            criterion_id: "modal-clear",
            criticality: "critical",
            evidence_requirements: ["screenshot"],
            human_visible_text: "The modal is clear"
          }
        ],
        budget_policy: {
          maxJobCost: 10,
          maxAssignments: 3,
          maxRetries: 1
        },
        deadline_at: "2026-06-01T00:00:00.000Z",
        idempotency_key: crypto.randomUUID(),
        risk_tier: "low",
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
        manifest_id: "manifest-us2-safe",
        job_id: jobId,
        raw_artifacts: [
          {
            artifact_id: "artifact-us2-safe",
            artifact_type: "screenshot",
            content_hash: "hash-us2-safe",
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
        classification_id: "classification-us2-safe",
        job_id: jobId,
        artifact_manifest_id: "manifest-us2-safe",
        data_class: "public",
        redaction_status: "completed",
        policy_version: "v1",
        externalization_decision: "allowed",
        audit_record_id: "audit-us2-safe"
      }
    });

    const taskResponse = await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/human-review-tasks`,
      payload: {
        criterion_ids: ["modal-clear"],
        deadline_at: "2026-06-01T00:00:00.000Z",
        quality_policy: "three-reviewers",
        reviewer_pool: "public_crowd",
        sanitized_package_id: "sanitized-only",
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
            criterion_id: "modal-clear",
            status: "pass",
            confidence: "high"
          }
        ],
        defect_category: "none",
        evidence_note: "The modal is clear.",
        overall_verdict: "pass",
        reviewer_pseudonymous_id: "reviewer-safe",
        severity: "S4"
      }
    });

    const consensusResponse = await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/consensus`,
      payload: {
        artifact_sufficiency: "sufficient",
        disagreement_level: "low",
        quorum_state: "met",
        recommended_outcome: "pass",
        review_task_id: reviewTaskId,
        severity_summary: "none",
        valid_response_count: 1
      }
    });

    expect(taskResponse.json()).not.toHaveProperty("raw_artifacts");
    expect(responseIngest.statusCode).toBe(202);
    expect(consensusResponse.statusCode).toBe(202);
  });
});
