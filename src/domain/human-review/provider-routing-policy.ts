import type { ProviderCapabilityProfile } from "./models.js";
import type { ReviewerPoolType } from "../shared/types.js";

export type ProviderHealth = Record<string, "healthy" | "degraded" | "down">;

export function selectProviderForPool(input: {
  health: ProviderHealth;
  pool: ReviewerPoolType;
  preferredProviderId?: string;
  providers: ProviderCapabilityProfile[];
}) {
  const providersForPool = input.providers.filter((provider) =>
    provider.supportedPoolTypes.includes(input.pool)
  );

  const preferred = input.preferredProviderId
    ? providersForPool.find((provider) => provider.providerId === input.preferredProviderId)
    : undefined;

  if (preferred && input.health[preferred.providerId] !== "down") {
    return preferred;
  }

  return (
    providersForPool.find((provider) => input.health[provider.providerId] === "healthy") ??
    providersForPool.find((provider) => input.health[provider.providerId] !== "down") ??
    null
  );
}
