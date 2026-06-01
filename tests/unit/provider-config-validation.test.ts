import { describe, expect, it } from "vitest";

import { validateProviderConfig } from "../../src/config/provider-config.js";

describe("provider config validation", () => {
  it("accepts disabled provider config without secrets", () => {
    const validation = validateProviderConfig({
      providerId: "real-provider",
      credentialSource: "env",
      accountScope: "local",
      dispatchMode: "mock",
      ingestionMode: "callback",
      enabled: false,
      fallbackProviderId: "internal-reviewer"
    });

    expect(validation.valid).toBe(true);
  });

  it("rejects enabled provider config when required fields are missing", () => {
    const validation = validateProviderConfig({
      providerId: "real-provider",
      credentialSource: "env",
      accountScope: "local",
      dispatchMode: "api",
      ingestionMode: "callback",
      enabled: true,
      fallbackProviderId: "internal-reviewer"
    });

    expect(validation.valid).toBe(false);
    expect(validation.errors).toEqual(
      expect.arrayContaining([
        "Missing required provider config field: apiKey",
        "dispatchUrl is required when PROVIDER_DISPATCH_MODE=api",
        "callbackBaseUrl is required when PROVIDER_INGESTION_MODE=callback",
        "sharedSecret is required when PROVIDER_INGESTION_MODE=callback"
      ])
    );
  });
});
