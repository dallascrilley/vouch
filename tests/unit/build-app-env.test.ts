import { describe, expect, it } from "vitest";

import { buildApp } from "../../src/api/app.js";

// `BuildAppOptions.env` replaced `process.env` rather than layering over it, so
// a caller passing a partial env silently lost `VITEST` — which is what
// `loadRuntimeConfig` uses to choose `:memory:` over an on-disk SQLite file.
// The failure was silent: the app still built, and the test suite quietly wrote
// to `.runtime/local-runtime.sqlite` and leaked state between runs.
describe("buildApp env handling", () => {
  it("keeps the in-memory database when the caller passes a partial env", async () => {
    const app = buildApp({ env: { PROVIDER_ENABLED: "false" } });
    try {
      expect(app.services.runtimeConfig.databasePath).toBe(":memory:");
      expect(app.services.runtimeConfig.providerStateDbPath).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  it("lets the caller's env win over the ambient process env", async () => {
    const app = buildApp({ env: { LOG_LEVEL: "silent" } });
    try {
      expect(app.services.runtimeConfig.logLevel).toBe("silent");
    } finally {
      await app.close();
    }
  });
});
