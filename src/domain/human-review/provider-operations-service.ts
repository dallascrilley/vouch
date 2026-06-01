import type { ProviderCapabilityProfile, ProviderHealthState } from "./models.js";
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

export class ProviderOperationsService {
  private readonly providerHealth = new Map<string, ProviderHealthState>();

  constructor(initialHealth: ProviderHealthState[]) {
    for (const state of initialHealth) {
      this.providerHealth.set(state.providerId, state);
    }
  }

  getHealthRecord(providerId: string) {
    return this.providerHealth.get(providerId) ?? null;
  }

  getHealthSnapshot(): ProviderHealth {
    return Object.fromEntries(
      [...this.providerHealth.values()].map((state) => [state.providerId, state.status])
    );
  }

  markHealthy(providerId: string) {
    const current = this.providerHealth.get(providerId);
    this.providerHealth.set(providerId, {
      providerId,
      status: "healthy",
      fallbackRoute: current?.fallbackRoute ?? "internal",
      lastSuccessAt: new Date(),
      lastFailureAt: current?.lastFailureAt,
      failureReason: undefined
    });
  }

  markFailure(providerId: string, reason: string) {
    const current = this.providerHealth.get(providerId);
    this.providerHealth.set(providerId, {
      providerId,
      status: "degraded",
      fallbackRoute: current?.fallbackRoute ?? "internal",
      lastSuccessAt: current?.lastSuccessAt,
      lastFailureAt: new Date(),
      failureReason: reason
    });
  }

  list() {
    return [...this.providerHealth.values()];
  }
}
