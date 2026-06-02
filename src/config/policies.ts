import type { RuntimeConfig } from "./runtime.js";
import type { BudgetPolicy } from "../domain/jobs/budget-policy.js";
import type { ProviderHealth } from "../domain/human-review/provider-routing-policy.js";

export const defaultBudgetPolicy: BudgetPolicy = {
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

export const defaultProviderHealth: ProviderHealth = {
  "internal-reviewer": "healthy",
  "public-crowd": "healthy"
};

export type LocalRuntimePolicyDefaults = {
  budgetPolicy: BudgetPolicy;
  providerHealth: ProviderHealth;
  resettablePaths: {
    artifactRoot: string;
    databasePath: string;
  };
  runtimeValidationScript: string;
};

export function buildLocalRuntimePolicyDefaults(config: RuntimeConfig): LocalRuntimePolicyDefaults {
  return {
    budgetPolicy: defaultBudgetPolicy,
    providerHealth: defaultProviderHealth,
    resettablePaths: {
      artifactRoot: config.artifactRoot,
      databasePath: config.databasePath
    },
    runtimeValidationScript: config.runtimeValidationScript
  };
}
