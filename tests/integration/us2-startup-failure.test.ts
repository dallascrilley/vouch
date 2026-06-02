import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../../src/api/app.js";
import { loadRuntimeConfig } from "../../src/config/runtime.js";

describe("US2 startup failure", () => {
  let runtimeRoot: string;

  beforeEach(() => {
    runtimeRoot = mkdtempSync(join(tmpdir(), "us2-startup-"));
  });

  afterEach(() => {
    rmSync(runtimeRoot, { force: true, recursive: true });
  });

  it("fails clearly when the artifact root points at a file", () => {
    const invalidArtifactRoot = join(runtimeRoot, "artifact-file");
    writeFileSync(invalidArtifactRoot, "not a directory");

    const config = loadRuntimeConfig({
      ...process.env,
      RUNTIME_ARTIFACT_ROOT: invalidArtifactRoot,
      RUNTIME_SQLITE_PATH: join(runtimeRoot, "runtime.sqlite")
    });

    expect(() => buildApp(config)).toThrow();
  });
});
