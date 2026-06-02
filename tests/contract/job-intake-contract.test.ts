import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../../src/api/app.js";

describe("POST /verification-jobs", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    app = buildApp();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("accepts a valid verification job and returns the contract shape", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/verification-jobs",
      payload: {
        acceptance_criteria: [
          {
            criterion_id: "toast-visible",
            criticality: "critical",
            evidence_requirements: ["screenshot"],
            human_visible_text: "The success toast is visible"
          }
        ],
        budget_policy: {
          maxJobCost: 10,
          maxAssignments: 2,
          maxRetries: 1
        },
        deadline_at: "2026-06-01T00:00:00.000Z",
        idempotency_key: "idempotency-1",
        risk_tier: "low",
        source: {
          repository: "repo",
          commit: "abc123",
          environment: "staging",
          route: "/demo"
        }
      }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      job_id: expect.any(String),
      idempotency_key: "idempotency-1",
      state: "created",
      risk_tier: "low"
    });
  });

  it("rejects an invalid request with no acceptance criteria", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/verification-jobs",
      payload: {
        acceptance_criteria: [],
        budget_policy: {
          maxJobCost: 10,
          maxAssignments: 2,
          maxRetries: 1
        },
        deadline_at: "2026-06-01T00:00:00.000Z",
        idempotency_key: "idempotency-2",
        risk_tier: "low",
        source: {
          repository: "repo",
          commit: "abc123",
          environment: "staging",
          route: "/demo"
        }
      }
    });

    expect(response.statusCode).toBe(400);
  });
});
