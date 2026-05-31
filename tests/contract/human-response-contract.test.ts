import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../../src/api/app.js";

async function createHumanReviewTask(app: ReturnType<typeof buildApp>) {
  const jobResponse = await app.inject({
    method: "POST",
    url: "/verification-jobs",
    payload: {
      acceptance_criteria: [
        {
          criterion_id: "toast-visible",
          criticality: "critical",
          evidence_requirements: ["screenshot"],
          human_visible_text: "The success toast is visible"
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
      manifest_id: "manifest-response",
      job_id: jobId,
      raw_artifacts: [
        {
          artifact_id: "artifact-response",
          artifact_type: "screenshot",
          content_hash: "hash-response",
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
      classification_id: "classification-response",
      job_id: jobId,
      artifact_manifest_id: "manifest-response",
      data_class: "public",
      redaction_status: "completed",
      policy_version: "v1",
      externalization_decision: "allowed",
      audit_record_id: "audit-response"
    }
  });

  const reviewTaskResponse = await app.inject({
    method: "POST",
    url: `/verification-jobs/${jobId}/human-review-tasks`,
    payload: {
      criterion_ids: ["toast-visible"],
      deadline_at: "2026-06-01T00:00:00.000Z",
      quality_policy: "three-reviewers",
      reviewer_pool: "public_crowd",
      sanitized_package_id: "package-response",
      task_template: "visual-check"
    }
  });

  return reviewTaskResponse.json().review_task_id as string;
}

describe("POST /human-review-tasks/{reviewTaskId}/responses", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    app = buildApp();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("accepts a normalized human review response", async () => {
    const reviewTaskId = await createHumanReviewTask(app);
    const response = await app.inject({
      method: "POST",
      url: `/human-review-tasks/${reviewTaskId}/responses`,
      payload: {
        confidence: "high",
        criterion_results: [
          {
            criterion_id: "toast-visible",
            status: "pass",
            confidence: "high"
          }
        ],
        defect_category: "none",
        evidence_note: "Success toast is clearly visible.",
        overall_verdict: "pass",
        reviewer_pseudonymous_id: "reviewer-1",
        severity: "S4"
      }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ review_task_id: reviewTaskId });
  });
});
