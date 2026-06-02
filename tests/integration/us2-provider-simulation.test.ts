import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../../src/api/app.js";
import { loadRuntimeConfig } from "../../src/config/runtime.js";
import { startWorkers } from "../../src/workers/index.js";

describe("US2 provider simulation", () => {
  let artifactRoot: string;
  let databasePath: string;
  let runtimeRoot: string;

  beforeEach(() => {
    runtimeRoot = mkdtempSync(join(tmpdir(), "us2-provider-sim-"));
    databasePath = join(runtimeRoot, "runtime.sqlite");
    artifactRoot = join(runtimeRoot, "artifacts");
  });

  afterEach(() => {
    rmSync(runtimeRoot, { force: true, recursive: true });
    delete process.env.RUNTIME_ARTIFACT_ROOT;
    delete process.env.RUNTIME_SQLITE_PATH;
  });

  it("enqueues provider-dispatch work and lets the local worker simulate a response", async () => {
    const config = loadRuntimeConfig({
      ...process.env,
      RUNTIME_ARTIFACT_ROOT: artifactRoot,
      RUNTIME_SQLITE_PATH: databasePath
    });
    const app = buildApp(config);
    await app.ready();

    const createResponse = await app.inject({
      method: "POST",
      payload: {
        acceptance_criteria: [
          {
            criticality: "critical",
            criterion_id: "provider-sim",
            evidence_requirements: ["screenshot"],
            human_visible_text: "The provider simulation should return a response"
          }
        ],
        budget_policy: {
          maxAssignments: 2,
          maxJobCost: 10,
          maxRetries: 1
        },
        deadline_at: "2026-06-01T00:00:00.000Z",
        idempotency_key: "provider-simulation",
        risk_tier: "low",
        source: {
          commit: "abc123",
          environment: "local",
          repository: "repo",
          route: "/provider-simulation"
        }
      },
      url: "/verification-jobs"
    });
    const jobId = createResponse.json<{ job_id: string }>().job_id;

    await app.inject({
      method: "POST",
      payload: {
        artifact_quality: "sufficient",
        environment: {
          commit: "abc123",
          environment: "local",
          repository: "repo",
          route: "/provider-simulation"
        },
        job_id: jobId,
        manifest_id: "manifest-provider-sim",
        raw_artifacts: [
          {
            artifact_id: "artifact-provider-sim",
            artifact_type: "screenshot",
            content_hash: "hash-provider-sim",
            provenance: "playwright"
          }
        ]
      },
      url: `/verification-jobs/${jobId}/artifacts`
    });

    await app.inject({
      method: "POST",
      payload: {
        artifact_manifest_id: "manifest-provider-sim",
        audit_record_id: "audit-provider-sim",
        classification_id: "privacy-provider-sim",
        data_class: "public",
        externalization_decision: "allowed",
        job_id: jobId,
        policy_version: "v1",
        redaction_status: "completed"
      },
      url: `/verification-jobs/${jobId}/privacy-classification`
    });

    await app.inject({
      method: "POST",
      payload: {
        criterion_ids: ["provider-sim"],
        deadline_at: "2026-06-01T01:00:00.000Z",
        quality_policy: "default",
        reviewer_pool: "public_crowd",
        sanitized_package_id: "package-provider-sim",
        task_template: "Review the screenshot"
      },
      url: `/verification-jobs/${jobId}/human-review-tasks`
    });

    await app.close();

    process.env.RUNTIME_ARTIFACT_ROOT = artifactRoot;
    process.env.RUNTIME_SQLITE_PATH = databasePath;

    const worker = await startWorkers();
    expect(worker.processedClaims).toBe(1);
    await worker.stop();

    const inspectionApp = buildApp(config);
    await inspectionApp.ready();
    const inspectionResponse = await inspectionApp.inject({
      method: "GET",
      url: `/runtime/inspection/jobs/${jobId}`
    });
    await inspectionApp.close();

    expect(inspectionResponse.json<{ job: { state: string } }>()).toMatchObject({
      job: {
        state: "human_responses_received"
      }
    });
  });
});
