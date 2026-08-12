import type {
  ProviderCapabilityProfile,
  ProviderHealthState
} from "./models.js";
import type { ReviewerPoolType } from "../shared/types.js";

export type ProviderHealth = Record<string, ProviderHealthState["status"]>;

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
    ? providersForPool.find(
        (provider) => provider.providerId === input.preferredProviderId
      )
    : undefined;

  if (preferred && input.health[preferred.providerId] !== "down") {
    return preferred;
  }

  return (
    providersForPool.find(
      (provider) => input.health[provider.providerId] === "healthy"
    ) ??
    providersForPool.find(
      (provider) => input.health[provider.providerId] !== "down"
    ) ??
    null
  );
}

export function shouldFallbackProvider(input: {
  allowedProviderIds?: string[];
  health: ProviderHealth;
  preferredProviderId: string;
}) {
  if (
    input.allowedProviderIds &&
    !input.allowedProviderIds.includes(input.preferredProviderId)
  ) {
    return {
      fallback: true,
      reason: "Preferred provider is not allowed for this privacy route"
    };
  }

  if (input.health[input.preferredProviderId] === "down") {
    return {
      fallback: true,
      reason: "Preferred provider is down"
    };
  }

  return {
    fallback: input.health[input.preferredProviderId] === "degraded",
    reason:
      input.health[input.preferredProviderId] === "degraded"
        ? "Preferred provider is degraded"
        : undefined
  };
}
