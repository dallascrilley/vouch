import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildApp } from "../../src/api/app.js";

describe("provider dispatch flow", () => {
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

  it("dispatches an eligible managed review task through the configured provider", async () => {
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

    expect(taskResponse.statusCode).toBe(202);
    expect(taskResponse.json()).toMatchObject({
      provider_adapter: "real-provider",
      dispatch_status: "dispatched"
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
