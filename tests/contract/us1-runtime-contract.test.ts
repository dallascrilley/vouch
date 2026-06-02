import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../../src/api/app.js";

describe("US1 runtime contract regression", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    app = buildApp();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns persisted budget policy and full source metadata on job readback", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/verification-jobs",
      payload: {
        acceptance_criteria: [
          {
            criterion_id: "contract",
            criticality: "critical",
            evidence_requirements: ["screenshot"],
            human_visible_text: "Contract fields round-trip"
          }
        ],
        budget_policy: {
          maxAssignments: 2,
          maxJobCost: 10,
          maxProjectDailyCost: 50,
          maxProviderDailyCost: 25,
          maxRetries: 1,
          maxRunCost: 7
        },
        deadline_at: "2026-06-01T00:00:00.000Z",
        idempotency_key: "runtime-contract",
        risk_tier: "low",
        source: {
          repository: "repo",
          branch: "main",
          commit: "abc123",
          build_id: "build-1",
          environment: "staging",
          route: "/demo",
          tenant: "tenant-1",
          feature_flags: ["flag-a"],
          viewport: "desktop",
          locale: "en-US",
          timezone: "America/Chicago"
        }
      }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      budget_policy: {
        max_job_cost: 10,
        max_assignments: 2,
        max_retries: 1,
        max_run_cost: 7,
        max_project_daily_cost: 50,
        max_provider_daily_cost: 25
      },
      source: {
        branch: "main",
        build_id: "build-1",
        feature_flags: ["flag-a"],
        tenant: "tenant-1",
        timezone: "America/Chicago"
      }
    });
  });
});
