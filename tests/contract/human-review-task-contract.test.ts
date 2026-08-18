import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../../src/api/app.js";

async function createBaseJob(app: ReturnType<typeof buildApp>) {
  const createResponse = await app.inject({
    method: "POST",
    url: "/verification-jobs",
    payload: {
      acceptance_criteria: [
        {
          criterion_id: "hero-visible",
          criticality: "critical",
          evidence_requirements: ["screenshot"],
          human_visible_text: "The hero state is visible"
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

  const jobId = createResponse.json().job_id as string;

  await app.inject({
    method: "POST",
    url: `/verification-jobs/${jobId}/artifacts`,
    payload: {
      manifest_id: "manifest-human-task",
      job_id: jobId,
      raw_artifacts: [
        {
          artifact_id: "artifact-human-task",
          artifact_type: "screenshot",
          content_hash: "hash-human-task",
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
      classification_id: "classification-human-task",
      job_id: jobId,
      artifact_manifest_id: "manifest-human-task",
      data_class: "public",
      redaction_status: "completed",
      policy_version: "v1",
      externalization_decision: "allowed",
      audit_record_id: "audit-human-task"
    }
  });

  return jobId;
}

describe("POST /verification-jobs/{jobId}/human-review-tasks", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    app = buildApp();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("creates a human review task for a safe external review case", async () => {
    const jobId = await createBaseJob(app);
    const response = await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/human-review-tasks`,
      payload: {
        criterion_ids: ["hero-visible"],
        deadline_at: "2026-06-01T00:00:00.000Z",
        quality_policy: "three-reviewers",
        reviewer_pool: "public_crowd",
        sanitized_package_id: "package-1",
        task_template: "visual-check"
      }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      job_id: jobId,
      provider_adapter: "public-crowd",
      reviewer_pool: "public_crowd"
    });
  });

  it("returns the existing task on an idempotent replay", async () => {
    const jobId = await createBaseJob(app);
    const payload = {
      criterion_ids: ["hero-visible"],
      deadline_at: "2026-06-01T00:00:00.000Z",
      idempotency_key: "human-task-replay",
      quality_policy: "three-reviewers",
      reviewer_pool: "public_crowd" as const,
      sanitized_package_id: "package-replay",
      task_template: "visual-check"
    };

    const first = await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/human-review-tasks`,
      payload
    });
    const second = await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/human-review-tasks`,
      payload
    });

    expect(first.statusCode).toBe(202);
    expect(second.statusCode).toBe(202);
    expect(second.json().review_task_id).toBe(first.json().review_task_id);
    await expect(
      app.services.runtimeRepositories.humanReviewTaskRepository.findByJobId(
        jobId
      )
    ).resolves.toHaveLength(1);
  });
});
