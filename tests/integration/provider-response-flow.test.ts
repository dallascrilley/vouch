import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildProviderTestApp,
  createProviderEligibleJob
} from "../helpers/provider-test-app.js";

describe("provider response flow", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = buildProviderTestApp();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("normalizes a provider callback and advances the existing consensus path", async () => {
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

    const callbackResponse = await app.inject({
      method: "POST",
      url: "/provider-callback",
      payload: {
        provider_id: "real-provider",
        provider_task_id: taskPayload.provider_task_id,
        provider_response_id: "provider-response-flow",
        reviewer_pseudonymous_id: "provider-reviewer",
        overall_verdict: "pass",
        criterion_results: [
          {
            criterion_id: "managed-check",
            status: "pass",
            confidence: "high"
          }
        ],
        defect_category: "none",
        evidence_note: "Managed provider confirmed the criterion.",
        severity: "S4",
        shared_secret: "top-secret"
      }
    });

    expect(callbackResponse.statusCode).toBe(202);
    expect(callbackResponse.json()).toMatchObject({ auto_advanced: true });
  });
});
