import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildProviderTestApp, createProviderEligibleJob } from "../helpers/provider-test-app.js";

describe("provider fallback", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = buildProviderTestApp();
    app.services.providerOperationsService.markFailure("real-provider", "outage");
    app.services.providerOperationsService.markFailure("real-provider", "outage");
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("keeps the task queued when the provider is degraded", async () => {
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
      dispatch_status: "queued"
    });
  });
});

