import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../../src/api/app.js";

async function prepareJob(app: ReturnType<typeof buildApp>, key: string) {
  const createResponse = await app.inject({
    method: "POST",
    url: "/verification-jobs",
    payload: {
      acceptance_criteria: [
        {
          criterion_id: "primary-cta",
          criticality: "critical",
          evidence_requirements: ["screenshot"],
          human_visible_text: "The primary CTA is visible"
        }
      ],
      budget_policy: {
        maxJobCost: 10,
        maxAssignments: 2,
        maxRetries: 1
      },
      deadline_at: "2026-06-01T00:00:00.000Z",
      idempotency_key: key,
      risk_tier: "low",
      source: {
        repository: "repo",
        commit: "abc123",
        environment: "staging",
        route: "/settings"
      }
    }
  });
  const jobId = createResponse.json().job_id as string;

  await app.inject({
    method: "POST",
    url: `/verification-jobs/${jobId}/artifacts`,
    payload: {
      manifest_id: `manifest-${key}`,
      job_id: jobId,
      raw_artifacts: [
        {
          artifact_id: `artifact-${key}`,
          artifact_type: "screenshot",
          content_hash: `hash-${key}`,
          provenance: "playwright"
        }
      ],
      artifact_quality: "sufficient",
      environment: {
        repository: "repo",
        commit: "abc123",
        environment: "staging",
        route: "/settings"
      }
    }
  });

  await app.inject({
    method: "POST",
    url: `/verification-jobs/${jobId}/privacy-classification`,
    payload: {
      classification_id: `classification-${key}`,
      job_id: jobId,
      artifact_manifest_id: `manifest-${key}`,
      data_class: "public",
      redaction_status: "completed",
      policy_version: "v1",
      externalization_decision: "allowed",
      audit_record_id: `audit-${key}`
    }
  });

  return jobId;
}

describe("US1 retry and recapture outcomes", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    app = buildApp();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns retry when self-verification recommends retry", async () => {
    const jobId = await prepareJob(app, "retry");

    await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/self-verification-results`,
      payload: {
        result_id: "result-retry",
        job_id: jobId,
        confidence: "medium",
        recommended_action: "retry",
        criterion_results: [
          {
            criterion_id: "primary-cta",
            status: "unclear",
            confidence: "medium"
          }
        ],
        failure_categories: ["loading"]
      }
    });

    const verdictResponse = await app.inject({
      method: "GET",
      url: `/verification-jobs/${jobId}/verdict`
    });

    expect(verdictResponse.json().final_verdict).toBe("retry");
  });

  it("returns recapture when self-verification recommends recapture", async () => {
    const jobId = await prepareJob(app, "recapture");

    await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/self-verification-results`,
      payload: {
        result_id: "result-recapture",
        job_id: jobId,
        confidence: "medium",
        recommended_action: "recapture",
        criterion_results: [
          {
            criterion_id: "primary-cta",
            status: "unclear",
            confidence: "medium"
          }
        ],
        failure_categories: ["blank"]
      }
    });

    const verdictResponse = await app.inject({
      method: "GET",
      url: `/verification-jobs/${jobId}/verdict`
    });

    expect(verdictResponse.json().final_verdict).toBe("recapture");
  });
});
