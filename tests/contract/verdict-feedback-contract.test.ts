import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../../src/api/app.js";

async function createPassingJob(app: ReturnType<typeof buildApp>) {
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
      manifest_id: "manifest-verdict",
      job_id: jobId,
      raw_artifacts: [
        {
          artifact_id: "artifact-verdict",
          artifact_type: "screenshot",
          content_hash: "hash-verdict",
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
      classification_id: "classification-verdict",
      job_id: jobId,
      artifact_manifest_id: "manifest-verdict",
      data_class: "public",
      redaction_status: "completed",
      policy_version: "v1",
      externalization_decision: "allowed",
      audit_record_id: "audit-verdict"
    }
  });

  await app.inject({
    method: "POST",
    url: `/verification-jobs/${jobId}/self-verification-results`,
    payload: {
      result_id: "result-verdict",
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

  return jobId;
}

describe("verdict and feedback routes", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    app = buildApp();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns the final verdict for a completed job", async () => {
    const jobId = await createPassingJob(app);
    const response = await app.inject({
      method: "GET",
      url: `/verification-jobs/${jobId}/verdict`
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      job_id: jobId,
      final_verdict: "pass",
      release_gate_effect: "allow"
    });
  });

  it("returns the machine-readable feedback for a completed job", async () => {
    const jobId = await createPassingJob(app);
    const response = await app.inject({
      method: "GET",
      url: `/verification-jobs/${jobId}/feedback`
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      agent_next_action: "pass",
      job_id: jobId,
      final_verdict: "pass",
      retry_allowed: false
    });
  });
});
