import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../../src/api/app.js";

async function createReadyJob(app: ReturnType<typeof buildApp>) {
  const createResponse = await app.inject({
    method: "POST",
    url: "/verification-jobs",
    payload: {
      acceptance_criteria: [
        {
          criterion_id: "success-state",
          criticality: "critical",
          evidence_requirements: ["screenshot"],
          human_visible_text: "The success state is visible"
        }
      ],
      budget_policy: {
        maxJobCost: 10,
        maxAssignments: 2,
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
      manifest_id: "manifest-self",
      job_id: jobId,
      raw_artifacts: [
        {
          artifact_id: "artifact-self",
          artifact_type: "screenshot",
          content_hash: "hash-self",
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
      classification_id: "classification-self",
      job_id: jobId,
      artifact_manifest_id: "manifest-self",
      data_class: "public",
      redaction_status: "completed",
      policy_version: "v1",
      externalization_decision: "allowed",
      audit_record_id: "audit-self"
    }
  });

  return jobId;
}

describe("POST /verification-jobs/{jobId}/self-verification-results", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    app = buildApp();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("accepts a self-verification result and returns 202", async () => {
    const jobId = await createReadyJob(app);
    const response = await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/self-verification-results`,
      payload: {
        result_id: "result-1",
        job_id: jobId,
        confidence: "high",
        recommended_action: "pass",
        criterion_results: [
          {
            criterion_id: "success-state",
            status: "pass",
            confidence: "high"
          }
        ]
      }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ result_id: "result-1" });
  });
});
