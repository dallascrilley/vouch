import type { RuntimeConfig } from "./runtime.js";
import type { BudgetPolicy } from "../domain/jobs/budget-policy.js";
import type {
  ProviderAdapterConfig,
  ProviderHealthState
} from "../domain/human-review/models.js";
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
  "public-crowd": "healthy",
  "real-provider": "healthy"
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

export function loadDefaultProviderConfig(env: NodeJS.ProcessEnv = process.env): ProviderAdapterConfig {
  return {
    providerId: env.PROVIDER_ID ?? "real-provider",
    credentialSource: env.PROVIDER_CREDENTIAL_SOURCE ?? "env",
    accountScope: env.PROVIDER_ACCOUNT_SCOPE ?? "local-workspace",
    dispatchMode: env.PROVIDER_DISPATCH_MODE === "mock" ? "mock" : "api",
    ingestionMode: env.PROVIDER_INGESTION_MODE === "polling" ? "polling" : "callback",
    callbackBaseUrl: env.PROVIDER_CALLBACK_BASE_URL,
    dispatchUrl: env.PROVIDER_DISPATCH_URL,
    enabled: env.PROVIDER_ENABLED === "true",
    apiKey: env.PROVIDER_API_KEY,
    sharedSecret: env.PROVIDER_SHARED_SECRET,
    fallbackProviderId: env.PROVIDER_FALLBACK_PROVIDER_ID ?? "internal-reviewer"
  };
}

export function buildDefaultProviderHealthStates(): ProviderHealthState[] {
  return [
    {
      providerId: "internal-reviewer",
      status: "healthy",
      fallbackRoute: "internal"
    },
    {
      providerId: "public-crowd",
      status: "healthy",
      fallbackRoute: "internal"
    },
    {
      providerId: "real-provider",
      status: "healthy",
      fallbackRoute: "internal",
      failureReason: undefined
    }
  ];
}
