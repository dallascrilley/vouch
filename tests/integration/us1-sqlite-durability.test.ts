import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../../src/api/app.js";
import { loadRuntimeConfig } from "../../src/config/runtime.js";

describe("US1 SQLite durability", () => {
  let artifactRoot: string;
  let databasePath: string;
  let runtimeRoot: string;

  beforeEach(() => {
    runtimeRoot = mkdtempSync(join(tmpdir(), "us1-runtime-"));
    databasePath = join(runtimeRoot, "runtime.sqlite");
    artifactRoot = join(runtimeRoot, "artifacts");
  });

  afterEach(() => {
    rmSync(runtimeRoot, { force: true, recursive: true });
  });

  it("retains final job state, verdict, feedback, and ledger records after restart", async () => {
    const firstApp = buildApp(
      loadRuntimeConfig({
        ...process.env,
        RUNTIME_ARTIFACT_ROOT: artifactRoot,
        RUNTIME_SQLITE_PATH: databasePath
      })
    );
    await firstApp.ready();

    const createResponse = await firstApp.inject({
      method: "POST",
      url: "/verification-jobs",
      payload: {
        acceptance_criteria: [
          {
            criticality: "critical",
            criterion_id: "durable-criterion",
            evidence_requirements: ["screenshot"],
            human_visible_text: "The runtime persists final state"
          }
        ],
        budget_policy: {
          maxAssignments: 1,
          maxJobCost: 5,
          maxRetries: 1
        },
        deadline_at: "2026-06-01T00:00:00.000Z",
        idempotency_key: "sqlite-durability",
        risk_tier: "low",
        source: {
          commit: "abc123",
          environment: "local",
          repository: "repo",
          route: "/durability"
        }
      }
    });
    const jobId = createResponse.json().job_id as string;

    await firstApp.inject({
      method: "POST",
      payload: {
        artifact_quality: "sufficient",
        environment: {
          commit: "abc123",
          environment: "local",
          repository: "repo",
          route: "/durability"
        },
        job_id: jobId,
        manifest_id: "manifest-durable",
        raw_artifacts: [
          {
            artifact_id: "artifact-durable",
            artifact_type: "screenshot",
            content_hash: "hash-durable",
            provenance: "playwright"
          }
        ]
      },
      url: `/verification-jobs/${jobId}/artifacts`
    });

    await firstApp.inject({
      method: "POST",
      payload: {
        artifact_manifest_id: "manifest-durable",
        audit_record_id: "audit-durable",
        classification_id: "classification-durable",
        data_class: "public",
        externalization_decision: "allowed",
        job_id: jobId,
        policy_version: "v1",
        redaction_status: "completed"
      },
      url: `/verification-jobs/${jobId}/privacy-classification`
    });

    await firstApp.inject({
      method: "POST",
      payload: {
        confidence: "high",
        criterion_results: [
          {
            confidence: "high",
            criterion_id: "durable-criterion",
            status: "pass"
          }
        ],
        job_id: jobId,
        recommended_action: "pass",
        result_id: "result-durable"
      },
      url: `/verification-jobs/${jobId}/self-verification-results`
    });

    await firstApp.close();

    const secondApp = buildApp(
      loadRuntimeConfig({
        ...process.env,
        RUNTIME_ARTIFACT_ROOT: artifactRoot,
        RUNTIME_SQLITE_PATH: databasePath
      })
    );
    await secondApp.ready();

    const inspectionResponse = await secondApp.inject({
      method: "GET",
      url: `/runtime/inspection/jobs/${jobId}`
    });

    await secondApp.close();

    expect(inspectionResponse.statusCode).toBe(200);
    expect(inspectionResponse.json()).toMatchObject({
      feedback: {
        finalVerdict: "pass",
        retryAllowed: false
      },
      job: {
        jobId,
        state: "final_pass"
      },
      verdict: {
        finalVerdict: "pass"
      }
    });
    expect(inspectionResponse.json().ledger).toHaveLength(6);
  });
});
