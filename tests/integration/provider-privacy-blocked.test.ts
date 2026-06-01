import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildApp } from "../../src/api/app.js";

describe("provider privacy blocked", () => {
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

  it("rejects provider dispatch when privacy policy blocks externalization", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/verification-jobs",
      payload: {
        acceptance_criteria: [
          {
            criterion_id: "blocked-check",
            criticality: "critical",
            evidence_requirements: ["screenshot"],
            human_visible_text: "Blocked check"
          }
        ],
        budget_policy: {
          maxJobCost: 10,
          maxAssignments: 2,
          maxRetries: 1
        },
        deadline_at: "2026-06-01T00:00:00.000Z",
        idempotency_key: crypto.randomUUID(),
        risk_tier: "high",
        source: {
          repository: "repo",
          commit: "abc123",
          environment: "staging",
          route: "/blocked"
        }
      }
    });
    const jobId = createResponse.json().job_id as string;

    await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/artifacts`,
      payload: {
        manifest_id: "manifest-blocked",
        job_id: jobId,
        raw_artifacts: [
          {
            artifact_id: "artifact-blocked",
            artifact_type: "screenshot",
            content_hash: "hash-blocked",
            provenance: "playwright"
          }
        ],
        artifact_quality: "sufficient",
        environment: {
          repository: "repo",
          commit: "abc123",
          environment: "staging",
          route: "/blocked"
        }
      }
    });

    await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/privacy-classification`,
      payload: {
        classification_id: "classification-blocked",
        job_id: jobId,
        artifact_manifest_id: "manifest-blocked",
        data_class: "regulated_or_secret",
        redaction_status: "failed",
        policy_version: "v1",
        externalization_decision: "blocked_fail_closed",
        audit_record_id: "audit-blocked"
      }
    });

    const taskResponse = await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/human-review-tasks`,
      payload: {
        criterion_ids: ["blocked-check"],
        deadline_at: "2026-06-01T00:00:00.000Z",
        provider_adapter: "real-provider",
        quality_policy: "provider-managed",
        reviewer_pool: "managed",
        sanitized_package_id: "managed-package",
        task_template: "provider-template"
      }
    });

    expect(taskResponse.statusCode).toBe(403);
  });
});
