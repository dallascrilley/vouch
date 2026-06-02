import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../../src/api/app.js";

async function createTaskWithResponse(app: ReturnType<typeof buildApp>) {
  const jobResponse = await app.inject({
    method: "POST",
    url: "/verification-jobs",
    payload: {
      acceptance_criteria: [
        {
          criterion_id: "layout-clear",
          criticality: "critical",
          evidence_requirements: ["screenshot"],
          human_visible_text: "The layout is clear"
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
      manifest_id: "manifest-consensus",
      job_id: jobId,
      raw_artifacts: [
        {
          artifact_id: "artifact-consensus",
          artifact_type: "screenshot",
          content_hash: "hash-consensus",
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
      classification_id: "classification-consensus",
      job_id: jobId,
      artifact_manifest_id: "manifest-consensus",
      data_class: "public",
      redaction_status: "completed",
      policy_version: "v1",
      externalization_decision: "allowed",
      audit_record_id: "audit-consensus"
    }
  });

  const reviewTaskResponse = await app.inject({
    method: "POST",
    url: `/verification-jobs/${jobId}/human-review-tasks`,
    payload: {
      criterion_ids: ["layout-clear"],
      deadline_at: "2026-06-01T00:00:00.000Z",
      quality_policy: "three-reviewers",
      reviewer_pool: "public_crowd",
      sanitized_package_id: "package-consensus",
      task_template: "visual-check"
    }
  });
  const reviewTaskId = reviewTaskResponse.json().review_task_id as string;

  await app.inject({
    method: "POST",
    url: `/human-review-tasks/${reviewTaskId}/responses`,
    payload: {
      confidence: "high",
      criterion_results: [
        {
          criterion_id: "layout-clear",
          status: "pass",
          confidence: "high"
        }
      ],
      defect_category: "none",
      evidence_note: "Layout is clear.",
      overall_verdict: "pass",
      reviewer_pseudonymous_id: "reviewer-consensus",
      severity: "S4"
    }
  });

  return { jobId, reviewTaskId };
}

describe("POST /verification-jobs/{jobId}/consensus", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    app = buildApp();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("accepts a consensus result for an existing review task", async () => {
    const { jobId, reviewTaskId } = await createTaskWithResponse(app);
    const response = await app.inject({
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

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      consensus_id: expect.any(String)
    });
  });
});
