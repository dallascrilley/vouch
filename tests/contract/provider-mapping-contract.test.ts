import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { buildApp } from "../../src/api/app.js";

describe("provider mapping persistence contract", () => {
  let app: ReturnType<typeof buildApp>;
  let providerSqlitePath: string;

  beforeEach(async () => {
    providerSqlitePath = join(mkdtempSync(join(tmpdir(), "provider-state-")), "provider-state.sqlite");
    app = buildApp({
      env: {
        ...process.env,
        PROVIDER_ENABLED: "true",
        PROVIDER_ID: "real-provider",
        PROVIDER_DISPATCH_MODE: "mock",
        PROVIDER_INGESTION_MODE: "callback",
        PROVIDER_API_KEY: "local-test-key",
        PROVIDER_CALLBACK_BASE_URL: "http://localhost:3000",
        PROVIDER_SHARED_SECRET: "top-secret",
        PROVIDER_SQLITE_PATH: providerSqlitePath
      },
      fetchImpl: vi.fn()
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("records provider task mappings before the callback path is used", async () => {
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

    const payload = taskResponse.json();
    const mapping = await app.services.providerMappingService.findByProviderTaskId(
      payload.provider_task_id as string
    );

    expect(payload.dispatch_status).toBe("dispatched");
    expect(mapping).toMatchObject({
      providerId: "real-provider",
      reviewTaskId: payload.review_task_id
    });

    await app.close();

    app = buildApp({
      env: {
        ...process.env,
        PROVIDER_ENABLED: "true",
        PROVIDER_ID: "real-provider",
        PROVIDER_DISPATCH_MODE: "mock",
        PROVIDER_INGESTION_MODE: "callback",
        PROVIDER_API_KEY: "local-test-key",
        PROVIDER_CALLBACK_BASE_URL: "http://localhost:3000",
        PROVIDER_SHARED_SECRET: "top-secret",
        PROVIDER_SQLITE_PATH: providerSqlitePath
      },
      fetchImpl: vi.fn()
    });
    await app.ready();

    const persisted = await app.services.providerMappingService.findByProviderTaskId(
      payload.provider_task_id as string
    );
    expect(persisted).toMatchObject({
      providerId: "real-provider",
      reviewTaskId: payload.review_task_id
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
