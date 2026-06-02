import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../../src/api/app.js";
import { loadRuntimeConfig } from "../../src/config/runtime.js";

describe("SQLite runtime quickstart", () => {
  let runtimeRoot: string;

  beforeEach(() => {
    runtimeRoot = mkdtempSync(join(tmpdir(), "sqlite-quickstart-"));
  });

  afterEach(() => {
    rmSync(runtimeRoot, { force: true, recursive: true });
  });

  it("runs the documented local runtime path end-to-end", async () => {
    const config = loadRuntimeConfig({
      ...process.env,
      RUNTIME_ARTIFACT_ROOT: join(runtimeRoot, "artifacts"),
      RUNTIME_SQLITE_PATH: join(runtimeRoot, "runtime.sqlite")
    });
    const app = buildApp(config);
    await app.ready();

    const inspection = await app.inject({ method: "GET", url: "/runtime/inspection" });
    expect(inspection.statusCode).toBe(200);

    const create = await app.inject({
      method: "POST",
      url: "/verification-jobs",
      payload: {
        acceptance_criteria: [
          {
            criterion_id: "quickstart",
            criticality: "critical",
            evidence_requirements: ["screenshot"],
            human_visible_text: "Quickstart flow works"
          }
        ],
        budget_policy: { maxAssignments: 1, maxJobCost: 5, maxRetries: 1 },
        deadline_at: "2026-06-01T00:00:00.000Z",
        idempotency_key: "sqlite-quickstart",
        risk_tier: "low",
        source: { repository: "repo", commit: "abc123", environment: "local", route: "/quickstart" }
      }
    });
    const jobId = create.json<{ job_id: string }>().job_id;

    await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/artifacts`,
      payload: {
        manifest_id: "manifest-quickstart",
        job_id: jobId,
        raw_artifacts: [
          {
            artifact_id: "artifact-quickstart",
            artifact_type: "screenshot",
            content_hash: "hash-quickstart",
            provenance: "playwright"
          }
        ],
        artifact_quality: "sufficient",
        environment: { repository: "repo", commit: "abc123", environment: "local", route: "/quickstart" }
      }
    });
    await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/privacy-classification`,
      payload: {
        classification_id: "classification-quickstart",
        job_id: jobId,
        artifact_manifest_id: "manifest-quickstart",
        data_class: "public",
        redaction_status: "completed",
        policy_version: "v1",
        externalization_decision: "allowed",
        audit_record_id: "audit-quickstart"
      }
    });
    await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/self-verification-results`,
      payload: {
        result_id: "result-quickstart",
        job_id: jobId,
        confidence: "high",
        recommended_action: "pass",
        criterion_results: [{ criterion_id: "quickstart", status: "pass", confidence: "high" }]
      }
    });

    const verdict = await app.inject({ method: "GET", url: `/verification-jobs/${jobId}/verdict` });
    await app.close();

    expect(verdict.json()).toMatchObject({
      final_verdict: "pass",
      release_gate_effect: "allow"
    });
  });
});
