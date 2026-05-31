import { describe, expect, it } from "vitest";

import {
  evaluateBudgetPolicy,
  resolveBudgetPolicy,
  type BudgetPolicy
} from "../../src/domain/jobs/budget-policy.js";

const basePolicy: BudgetPolicy = {
  maxAssignments: 3,
  maxJobCost: 25,
  maxProjectDailyCost: 250,
  maxProviderDailyCost: 125,
  maxRetries: 2,
  maxRunCost: 75,
  riskTierOverrides: {
    release_gating: {
      maxJobCost: 40,
      maxRetries: 1
    }
  }
};

describe("budget policy", () => {
  it("allows usage within the configured caps", () => {
    const result = evaluateBudgetPolicy(
      basePolicy,
      {
        assignmentCount: 2,
        jobCost: 20,
        projectDailyCost: 200,
        providerDailyCost: 100,
        retriesUsed: 1,
        runCost: 50
      },
      "low"
    );

    expect(result).toEqual({
      allowed: true,
      blockingCaps: []
    });
  });

  it("reports every cap that is exceeded", () => {
    const result = evaluateBudgetPolicy(
      basePolicy,
      {
        assignmentCount: 5,
        jobCost: 30,
        projectDailyCost: 275,
        providerDailyCost: 150,
        retriesUsed: 4,
        runCost: 90
      },
      "low"
    );

    expect(result.allowed).toBe(false);
    expect(result.blockingCaps).toEqual([
      "maxJobCost",
      "maxAssignments",
      "maxRetries",
      "maxRunCost",
      "maxProjectDailyCost",
      "maxProviderDailyCost"
    ]);
  });

  it("applies risk-tier overrides when resolving policy", () => {
    const resolved = resolveBudgetPolicy(basePolicy, "release_gating");

    expect(resolved.maxJobCost).toBe(40);
    expect(resolved.maxRetries).toBe(1);
    expect(resolved.maxAssignments).toBe(3);
  });
});
