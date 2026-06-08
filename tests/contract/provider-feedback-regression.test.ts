import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildApp } from "../../src/api/app.js";

describe("provider feedback regression", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    app = buildApp({
      env: {
        ...process.env,
        PROVIDER_ENABLED: "true",
        PROVIDER_ID: "real-provider",
        PROVIDER_DISPATCH_MODE: "mock",
        PROVIDER_INGESTION_MODE: "callback",
        PROVIDER_API_KEY: "local-test-key",
        PROVIDER_CALLBACK_BASE_URL: "http://localhost:3000",
        PROVIDER_SHARED_SECRET: "top-secret"
      },
      fetchImpl: vi.fn()
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("preserves machine-readable feedback after provider-originated adjudication", async () => {
    const jobId = await createProviderEligibleJob(app);
    const taskResponse = await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/human-review-tasks`,
      payload: {
        criterion_ids: ["managed-check"],
        deadline_at: "2026-06-01T00:00:00.000Z",
        provider_adapter: "real-provider",
        quality_policy: "provider-managed",
        reviewer_pool: "managed",
        sanitized_package_id: "managed-package",
        task_template: "provider-template"
      }
    });
    const taskPayload = taskResponse.json();

    await app.inject({
      method: "POST",
      url: "/provider-callback",
      payload: {
        provider_id: "real-provider",
        provider_task_id: taskPayload.provider_task_id,
        provider_response_id: "provider-feedback",
        reviewer_pseudonymous_id: "provider-reviewer",
        overall_verdict: "unclear",
        criterion_results: [
          {
            criterion_id: "managed-check",
            status: "unclear",
            confidence: "medium"
          }
        ],
        defect_category: "layout",
        evidence_note: "Provider reviewer could not confirm the state.",
        severity: "S2",
        shared_secret: "top-secret"
      }
    });

    const feedbackResponse = await app.inject({
      method: "GET",
      url: `/verification-jobs/${jobId}/feedback`
    });

    expect(feedbackResponse.statusCode).toBe(200);
    expect(feedbackResponse.json()).toMatchObject({
      final_verdict: "retry",
      provider_ids: ["real-provider"],
      provider_response_ids: ["provider-feedback"],
      retry_allowed: true,
      retry_reason: "provider_callback_auto_resolution"
    });
  });
});

async function createProviderEligibleJob(app: ReturnType<typeof buildApp>) {
  const createResponse = await app.inject({
    method: "POST",
    url: "/verification-jobs",
    payload: {
      acceptance_criteria: [
        {
          criterion_id: "managed-check",
          criticality: "critical",
          evidence_requirements: ["screenshot"],
          human_visible_text: "The managed provider check passes"
        }
      ],
      budget_policy: {
        maxJobCost: 10,
        maxAssignments: 2,
        maxRetries: 1
      },
      deadline_at: "2026-06-01T00:00:00.000Z",
      idempotency_key: crypto.randomUUID(),
      risk_tier: "medium",
      source: {
        repository: "repo",
        commit: "abc123",
        environment: "staging",
        route: "/managed"
      }
    }
  });
  const jobId = createResponse.json().job_id as string;

  await app.inject({
    method: "POST",
    url: `/verification-jobs/${jobId}/artifacts`,
    payload: {
      manifest_id: "manifest-managed",
      job_id: jobId,
      raw_artifacts: [
        {
          artifact_id: "artifact-managed",
          artifact_type: "screenshot",
          content_hash: "hash-managed",
          provenance: "playwright"
        }
      ],
      artifact_quality: "sufficient",
      environment: {
        repository: "repo",
        commit: "abc123",
        environment: "staging",
        route: "/managed"
      }
    }
  });

  await app.inject({
    method: "POST",
    url: `/verification-jobs/${jobId}/privacy-classification`,
    payload: {
      classification_id: "classification-managed",
      job_id: jobId,
      artifact_manifest_id: "manifest-managed",
      data_class: "internal_low",
      redaction_status: "completed",
      allowed_reviewer_routes: ["managed"],
      policy_version: "v1",
      externalization_decision: "allowed",
      audit_record_id: "audit-managed"
    }
  });

  return jobId;
}
