import type { ProviderCapabilityProfile } from "./models.js";
import type { ProviderHealth } from "./provider-routing-policy.js";

export type ProviderCostSnapshot = Record<string, number>;

export function summarizeProviderOperations(input: {
  costs: ProviderCostSnapshot;
  health: ProviderHealth;
  providers: ProviderCapabilityProfile[];
}) {
  return input.providers.map((provider) => ({
    cost: input.costs[provider.providerId] ?? 0,
    health: input.health[provider.providerId] ?? "healthy",
    providerId: provider.providerId,
    pools: provider.supportedPoolTypes
  }));
}
