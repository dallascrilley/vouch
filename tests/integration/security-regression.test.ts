import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildApp } from "../../src/api/app.js";

type App = ReturnType<typeof buildApp>;

const providerEnv = {
  ...process.env,
  PROVIDER_ENABLED: "true",
  PROVIDER_ID: "real-provider",
  PROVIDER_DISPATCH_MODE: "mock",
  PROVIDER_INGESTION_MODE: "callback",
  PROVIDER_API_KEY: "local-test-key",
  PROVIDER_CALLBACK_BASE_URL: "http://localhost:3000",
  PROVIDER_SHARED_SECRET: "top-secret"
};

async function createClassifiedJob(
  app: App,
  options: {
    dataClass?: string;
    redactionStatus?: string;
    decision?: string;
    route?: string;
    allowedReviewerRoutes?: string[];
  } = {}
) {
  const dataClass = options.dataClass ?? "internal_low";
  const redactionStatus = options.redactionStatus ?? "completed";
  const decision = options.decision ?? "allowed";
  const route = options.route ?? "/managed";
  const allowedReviewerRoutes = options.allowedReviewerRoutes ?? ["managed"];

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
      budget_policy: { maxJobCost: 10, maxAssignments: 2, maxRetries: 1 },
      deadline_at: "2026-06-01T00:00:00.000Z",
      idempotency_key: crypto.randomUUID(),
      risk_tier: "medium",
      source: {
        repository: "repo",
        commit: "abc123",
        environment: "staging",
        route
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
        route
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
      data_class: dataClass,
      redaction_status: redactionStatus,
      allowed_reviewer_routes: allowedReviewerRoutes,
      policy_version: "v1",
      externalization_decision: decision,
      audit_record_id: "audit-managed"
    }
  });

  return jobId;
}

function createTask(
  app: App,
  jobId: string,
  overrides: { reviewerPool?: string; idempotencyKey?: string } = {}
) {
  return app.inject({
    method: "POST",
    url: `/verification-jobs/${jobId}/human-review-tasks`,
    payload: {
      criterion_ids: ["managed-check"],
      deadline_at: "2026-06-01T00:00:00.000Z",
      provider_adapter: "real-provider",
      quality_policy: "provider-managed",
      reviewer_pool: overrides.reviewerPool ?? "managed",
      sanitized_package_id: "managed-package",
      task_template: "provider-template",
      ...(overrides.idempotencyKey
        ? { idempotency_key: overrides.idempotencyKey }
        : {})
    }
  });
}

describe("security regressions", () => {
  describe("provider callback authentication", () => {
    let app: App;
    beforeEach(async () => {
      app = buildApp({ env: providerEnv, fetchImpl: vi.fn() });
      await app.ready();
    });
    afterEach(async () => {
      await app.close();
    });

    async function dispatchTask() {
      const jobId = await createClassifiedJob(app);
      const taskResponse = await createTask(app, jobId);
      return taskResponse.json().provider_task_id as string;
    }

    function callback(
      providerTaskId: string,
      overrides: Record<string, unknown> = {}
    ) {
      return app.inject({
        method: "POST",
        url: "/provider-callback",
        payload: {
          provider_id: "real-provider",
          provider_task_id: providerTaskId,
          provider_response_id: "resp-1",
          reviewer_pseudonymous_id: "reviewer",
          overall_verdict: "pass",
          criterion_results: [
            {
              criterion_id: "managed-check",
              status: "pass",
              confidence: "high"
            }
          ],
          defect_category: "none",
          evidence_note: "ok",
          severity: "S4",
          ...overrides
        }
      });
    }

    it("rejects a callback that omits the shared secret", async () => {
      const providerTaskId = await dispatchTask();
      const response = await callback(providerTaskId, {
        shared_secret: undefined
      });
      expect(response.statusCode).toBe(401);
    });

    it("rejects a callback with the wrong shared secret", async () => {
      const providerTaskId = await dispatchTask();
      const response = await callback(providerTaskId, {
        shared_secret: "guess"
      });
      expect(response.statusCode).toBe(401);
    });

    it("rejects a callback whose provider_id does not match the mapping", async () => {
      const providerTaskId = await dispatchTask();
      const response = await callback(providerTaskId, {
        provider_id: "spoofed-provider",
        shared_secret: "top-secret"
      });
      expect(response.statusCode).toBe(422);
    });

    it("deduplicates a replayed callback instead of reprocessing it", async () => {
      const providerTaskId = await dispatchTask();
      const first = await callback(providerTaskId, {
        shared_secret: "top-secret"
      });
      const second = await callback(providerTaskId, {
        shared_secret: "top-secret"
      });
      expect(first.statusCode).toBe(202);
      expect(first.json().deduplicated).toBe(false);
      expect(second.statusCode).toBe(202);
      expect(second.json().deduplicated).toBe(true);
    });
  });

  describe("privacy gate server-side enforcement", () => {
    let app: App;
    beforeEach(async () => {
      app = buildApp({ env: providerEnv, fetchImpl: vi.fn() });
      await app.ready();
    });
    afterEach(async () => {
      await app.close();
    });

    it("blocks dispatch when redaction failed even if the client asserts allowed", async () => {
      const jobId = await createClassifiedJob(app, {
        redactionStatus: "failed",
        decision: "allowed"
      });
      const response = await createTask(app, jobId);
      expect(response.statusCode).toBe(403);
    });

    it("blocks regulated data from a non-internal pool even if the client asserts allowed", async () => {
      const jobId = await createClassifiedJob(app, {
        dataClass: "regulated_or_secret",
        redactionStatus: "completed",
        decision: "allowed"
      });
      const response = await createTask(app, jobId);
      expect(response.statusCode).toBe(403);
    });

    it("blocks a replayed idempotency key that asserts a different pool than the stored task", async () => {
      // The gate recomputes the policy from request.body.reviewer_pool, but
      // dispatch uses the stored task's reviewerPool. createOrGet returns an
      // existing task by idempotency key without checking that the requested
      // pool matches, so the two can diverge on the replay path.
      const jobId = await createClassifiedJob(app, {
        decision: "allowed",
        route: "/billing/invoices",
        allowedReviewerRoutes: ["managed", "internal"]
      });
      const idempotencyKey = crypto.randomUUID();

      // Managed on a billing route is blocked -- but the task is persisted
      // before the gate runs.
      const blocked = await createTask(app, jobId, {
        reviewerPool: "managed",
        idempotencyKey
      });
      expect(blocked.statusCode).toBe(403);

      // Replay the same key asserting "internal", which the billing rule
      // permits. The stored task is still managed.
      const replay = await createTask(app, jobId, {
        reviewerPool: "internal",
        idempotencyKey
      });
      expect(replay.statusCode).toBe(403);
      expect(replay.json().reviewer_pool).not.toBe("managed");
    });

    it("blocks managed-pool dispatch for billing routes even if the client asserts allowed", async () => {
      const jobId = await createClassifiedJob(app, {
        decision: "allowed",
        route: "/billing/invoices"
      });
      const response = await createTask(app, jobId);
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({
        message: expect.stringContaining(
          "billing routes require internal review"
        )
      });
    });
  });

  describe("runtime inspection authorization", () => {
    it("requires the operator token when one is configured", async () => {
      const app = buildApp({
        env: { ...process.env, RUNTIME_OPERATOR_TOKEN: "op-token" }
      });
      await app.ready();
      try {
        const missing = await app.inject({
          method: "GET",
          url: "/runtime/inspection"
        });
        expect(missing.statusCode).toBe(401);

        const authorized = await app.inject({
          method: "GET",
          url: "/runtime/inspection",
          headers: { "x-operator-token": "op-token" }
        });
        expect(authorized.statusCode).toBe(200);
      } finally {
        await app.close();
      }
    });
  });
});
