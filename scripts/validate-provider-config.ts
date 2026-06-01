import { loadDefaultProviderConfig } from "../src/config/policies.js";
import { buildLocalProviderValidationProfile, validateProviderConfig } from "../src/config/provider-config.js";

const config = loadDefaultProviderConfig(process.env);
const validation = validateProviderConfig(config);
const profile = buildLocalProviderValidationProfile(config);

if (!validation.valid) {
  console.error("Provider validation failed");
  for (const error of validation.errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      provider_id: config.providerId,
      enabled: config.enabled,
      dispatch_mode: config.dispatchMode,
      ingestion_mode: config.ingestionMode,
      required_env: profile.requiredLocalEnv,
      validation_commands: profile.validationCommandSet
    },
    null,
    2
  )
);
