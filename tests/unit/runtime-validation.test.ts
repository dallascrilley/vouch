import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { validateRuntimeConfig } from "../../src/config/runtime-validation.js";

describe("runtime validation", () => {
  it("creates missing runtime directories for a valid configuration", () => {
    const root = mkdtempSync(join(tmpdir(), "runtime-validation-"));

    expect(() =>
      validateRuntimeConfig({
        artifactRoot: join(root, "artifacts"),
        databasePath: join(root, "runtime.sqlite"),
        localProviderMode: "simulated",
        logLevel: "info",
        nodeEnv: "test",
        port: 3000,
        providerValidationScript: "npm run validate:provider",
        queueClaimTtlSeconds: 60,
        runtimeValidationScript: "npm run validate:local-runtime"
      })
    ).not.toThrow();

    rmSync(root, { force: true, recursive: true });
  });

  it("throws when the artifact root points at a file", () => {
    const root = mkdtempSync(join(tmpdir(), "runtime-validation-"));
    const filePath = join(root, "not-a-directory");
    writeFileSync(filePath, "x");

    expect(() =>
      validateRuntimeConfig({
        artifactRoot: filePath,
        databasePath: join(root, "runtime.sqlite"),
        localProviderMode: "simulated",
        logLevel: "info",
        nodeEnv: "test",
        port: 3000,
        providerValidationScript: "npm run validate:provider",
        queueClaimTtlSeconds: 60,
        runtimeValidationScript: "npm run validate:local-runtime"
      })
    ).toThrow();

    rmSync(root, { force: true, recursive: true });
  });
});
