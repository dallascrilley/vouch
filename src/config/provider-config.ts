import type {
  LocalProviderValidationProfile,
  ProviderAdapterConfig
} from "../domain/human-review/models.js";

const REQUIRED_ENABLED_FIELDS = [
  "providerId",
  "credentialSource",
  "accountScope",
  "fallbackProviderId"
] as const;

export function validateProviderConfig(config: ProviderAdapterConfig) {
  const errors: string[] = [];

  if (!config.enabled) {
    return { valid: true, errors };
  }

  for (const field of REQUIRED_ENABLED_FIELDS) {
    if (!config[field]?.trim()) {
      errors.push(`Missing required provider config field: ${field}`);
    }
  }

  if (!config.apiKey?.trim()) {
    errors.push("Missing required provider config field: apiKey");
  }

  if (config.dispatchMode === "api" && !config.dispatchUrl?.trim()) {
    errors.push("dispatchUrl is required when PROVIDER_DISPATCH_MODE=api");
  }

  if (config.ingestionMode === "callback" && !config.callbackBaseUrl?.trim()) {
    errors.push(
      "callbackBaseUrl is required when PROVIDER_INGESTION_MODE=callback"
    );
  }

  if (config.ingestionMode === "callback" && !config.sharedSecret?.trim()) {
    errors.push(
      "sharedSecret is required when PROVIDER_INGESTION_MODE=callback"
    );
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function buildLocalProviderValidationProfile(
  config: ProviderAdapterConfig
): LocalProviderValidationProfile {
  return {
    providerId: config.providerId,
    validationCommandSet: [
      "npm run lint",
      "npm run build",
      "npm test",
      "npm run validate:provider"
    ],
    requiredLocalEnv: [
      "PROVIDER_ENABLED",
      "PROVIDER_API_KEY",
      "PROVIDER_DISPATCH_URL",
      "PROVIDER_CALLBACK_BASE_URL",
      "PROVIDER_SHARED_SECRET"
    ],
    expectedDispatchEvidence: [
      "provider task mapping recorded",
      "provider health updated",
      "task state advanced to dispatched"
    ],
    expectedIngestionEvidence: [
      "provider receipt stored before normalization",
      "normalized human response stored",
      "consensus and verdict flow remains intact"
    ]
  };
}
