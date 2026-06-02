import { describe, expect, it } from "vitest";

import { buildApp } from "../../src/api/app.js";

describe("provider invalid credentials", () => {
  it("fails fast on startup when provider enablement is missing required credentials", () => {
    expect(() =>
      buildApp({
        env: {
          ...process.env,
          PROVIDER_ENABLED: "true",
          PROVIDER_ID: "real-provider",
          PROVIDER_DISPATCH_MODE: "api",
          PROVIDER_INGESTION_MODE: "callback"
        }
      })
    ).toThrow(/Missing required provider config field: apiKey/);
  });
});
