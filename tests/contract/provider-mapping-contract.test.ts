import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildApp } from "../../src/api/app.js";
import { createProviderEligibleJob } from "../helpers/provider-test-app.js";

describe("provider mapping persistence contract", () => {
  let app: FastifyInstance;
  let providerSqlitePath: string;

  beforeEach(async () => {
    providerSqlitePath = join(
      mkdtempSync(join(tmpdir(), "provider-state-")),
      "provider-state.sqlite"
    );
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
    const mapping =
      await app.services.providerMappingService.findByProviderTaskId(
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

    const persisted =
      await app.services.providerMappingService.findByProviderTaskId(
        payload.provider_task_id as string
      );
    expect(persisted).toMatchObject({
      providerId: "real-provider",
      reviewTaskId: payload.review_task_id
    });
  });
});
