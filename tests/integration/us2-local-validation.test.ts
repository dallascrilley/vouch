import { describe, expect, it } from "vitest";

import { buildApp } from "../../src/api/app.js";
import { loadRuntimeConfig } from "../../src/config/runtime.js";

describe("US2 local runtime inspection", () => {
  it("exposes local runtime inspection metadata", async () => {
    const app = buildApp(
      loadRuntimeConfig({
        ...process.env,
        RUNTIME_ARTIFACT_ROOT: ".runtime/test-artifacts",
        RUNTIME_SQLITE_PATH: ":memory:"
      })
    );
    await app.ready();

    const response = await app.inject({
      method: "GET",
      url: "/runtime/inspection"
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      artifact_root: ".runtime/test-artifacts",
      database_path: ":memory:"
    });
  });
});
