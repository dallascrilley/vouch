import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildApp } from "../../src/api/app.js";
import { loadRuntimeConfig } from "../../src/config/runtime.js";

describe("US1 atomic persistence", () => {
  let artifactRoot: string;
  let databasePath: string;
  let runtimeRoot: string;

  beforeEach(() => {
    runtimeRoot = mkdtempSync(join(tmpdir(), "us1-atomic-"));
    databasePath = join(runtimeRoot, "runtime.sqlite");
    artifactRoot = join(runtimeRoot, "artifacts");
  });

  afterEach(() => {
    rmSync(runtimeRoot, { force: true, recursive: true });
  });

  it("rolls back job state and ledger writes when artifact persistence fails", async () => {
    const app = buildApp(
      loadRuntimeConfig({
        ...process.env,
        RUNTIME_ARTIFACT_ROOT: artifactRoot,
        RUNTIME_SQLITE_PATH: databasePath
      })
    );
    await app.ready();

    const createResponse = await app.inject({
      method: "POST",
      payload: {
        acceptance_criteria: [
          {
            criticality: "critical",
            criterion_id: "atomic-criterion",
            evidence_requirements: ["screenshot"],
            human_visible_text: "The runtime should roll back partial writes"
          }
        ],
        budget_policy: {
          maxAssignments: 1,
          maxJobCost: 5,
          maxRetries: 1
        },
        deadline_at: "2026-06-01T00:00:00.000Z",
        idempotency_key: "atomic-persistence",
        risk_tier: "low",
        source: {
          commit: "abc123",
          environment: "local",
          repository: "repo",
          route: "/atomic"
        }
      },
      url: "/verification-jobs"
    });
    const jobId = createResponse.json<{ job_id: string }>().job_id;

    const saveSpy = vi
      .spyOn(
        app.services.runtimeRepositories.artifactManifestRepository,
        "save"
      )
      .mockRejectedValueOnce(new Error("disk full"));

    const artifactResponse = await app.inject({
      method: "POST",
      payload: {
        artifact_quality: "sufficient",
        environment: {
          commit: "abc123",
          environment: "local",
          repository: "repo",
          route: "/atomic"
        },
        job_id: jobId,
        manifest_id: "manifest-atomic",
        raw_artifacts: [
          {
            artifact_id: "artifact-atomic",
            artifact_type: "screenshot",
            content_hash: "hash-atomic",
            provenance: "playwright"
          }
        ]
      },
      url: `/verification-jobs/${jobId}/artifacts`
    });

    const inspectionResponse = await app.inject({
      method: "GET",
      url: `/runtime/inspection/jobs/${jobId}`
    });

    await app.close();
    saveSpy.mockRestore();

    expect(artifactResponse.statusCode).toBe(400);
    expect(
      inspectionResponse.json<{ job: { state: string }; ledger: unknown[] }>()
    ).toMatchObject({
      job: {
        state: "created"
      },
      ledger: []
    });
  });
});
