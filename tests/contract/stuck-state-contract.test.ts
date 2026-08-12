import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildProviderTestApp,
  createProviderEligibleJob
} from "../helpers/provider-test-app.js";

const STUCK_REASONS = [
  "awaiting_consensus",
  "ambiguous_callback",
  "budget_blocked",
  "pairwise_pending",
  "adjudication_required"
];

const RECOMMENDED_NEXT_ACTIONS = [
  "fetch_feedback",
  "post_consensus",
  "await_pairwise_tie_break",
  "post_adjudication",
  "raise_budget_or_accept_fail_closed"
];

describe("stuck-state contract", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = buildProviderTestApp();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("pins the stuck-state response schema", async () => {
    const jobId = await createProviderEligibleJob(app);
    await app.inject({
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

    const response = await app.inject({
      method: "GET",
      url: `/verification-jobs/${jobId}/stuck-state`
    });
    const body = response.json<Record<string, unknown>>();

    expect(response.statusCode).toBe(200);
    expect(Object.keys(body).sort()).toEqual([
      "job_id",
      "job_state",
      "ledger_tail",
      "pairwise_review_task_id",
      "recommended_next_action",
      "sanitized_package_hash",
      "stuck",
      "stuck_reason"
    ]);
    expect(typeof body.job_id).toBe("string");
    expect(typeof body.job_state).toBe("string");
    expect(typeof body.stuck).toBe("boolean");
    expect(
      body.stuck_reason === null ||
        STUCK_REASONS.includes(body.stuck_reason as string)
    ).toBe(true);
    expect(
      body.recommended_next_action === null ||
        RECOMMENDED_NEXT_ACTIONS.includes(
          body.recommended_next_action as string
        )
    ).toBe(true);

    const ledgerTail = body.ledger_tail as Array<Record<string, unknown>>;
    expect(Array.isArray(ledgerTail)).toBe(true);
    expect(ledgerTail.length).toBeGreaterThan(0);
    for (const entry of ledgerTail) {
      expect(Object.keys(entry).sort()).toEqual(["event_id", "event_type"]);
    }

    // Privacy gate: only a hash of the sanitized package id, never the raw
    // package or artifacts.
    expect(body.sanitized_package_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(body)).not.toContain("managed-package");
  });

  it("returns 404 for unknown jobs", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/verification-jobs/job_does-not-exist/stuck-state"
    });
    expect(response.statusCode).toBe(404);
  });

  it("requires the operator token when one is configured", async () => {
    await app.close();
    app = buildProviderTestApp({ operatorToken: "stuck-state-operator" });
    await app.ready();

    const jobId = await createProviderEligibleJob(app);

    const unauthorized = await app.inject({
      method: "GET",
      url: `/verification-jobs/${jobId}/stuck-state`
    });
    const authorized = await app.inject({
      method: "GET",
      url: `/verification-jobs/${jobId}/stuck-state`,
      headers: { "x-operator-token": "stuck-state-operator" }
    });

    expect(unauthorized.statusCode).toBe(401);
    expect(authorized.statusCode).toBe(200);
  });
});
