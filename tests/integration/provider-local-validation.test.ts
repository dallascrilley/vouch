import { describe, expect, it } from "vitest";

import { buildLocalProviderValidationProfile, validateProviderConfig } from "../../src/config/provider-config.js";
import { loadDefaultProviderConfig } from "../../src/config/policies.js";

describe("provider local validation workflow", () => {
  it("builds the documented local validation profile for an enabled provider", () => {
    const config = loadDefaultProviderConfig({
      PROVIDER_ENABLED: "true",
      PROVIDER_ID: "real-provider",
      PROVIDER_DISPATCH_MODE: "mock",
      PROVIDER_INGESTION_MODE: "callback",
      PROVIDER_API_KEY: "local-test-key",
      PROVIDER_CALLBACK_BASE_URL: "http://localhost:3000",
      PROVIDER_SHARED_SECRET: "top-secret"
    });
    const validation = validateProviderConfig(config);
    const profile = buildLocalProviderValidationProfile(config);

    expect(validation.valid).toBe(true);
    expect(profile.validationCommandSet).toContain("npm run validate:provider");
    expect(profile.requiredLocalEnv).toContain("PROVIDER_API_KEY");
  });
});
