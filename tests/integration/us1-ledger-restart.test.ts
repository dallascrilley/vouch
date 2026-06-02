import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../../src/api/app.js";
import { loadRuntimeConfig } from "../../src/config/runtime.js";

describe("US1 ledger restart", () => {
  let runtimeRoot: string;

  beforeEach(() => {
    runtimeRoot = mkdtempSync(join(tmpdir(), "us1-ledger-"));
  });

  afterEach(() => {
    rmSync(runtimeRoot, { force: true, recursive: true });
  });

  it("preserves append-only ledger events across restart", async () => {
    const config = loadRuntimeConfig({
      ...process.env,
      RUNTIME_ARTIFACT_ROOT: join(runtimeRoot, "artifacts"),
      RUNTIME_SQLITE_PATH: join(runtimeRoot, "runtime.sqlite")
    });
    const app = buildApp(config);
    await app.ready();

    const createResponse = await app.inject({
      method: "POST",
      url: "/verification-jobs",
      payload: {
        acceptance_criteria: [
          {
            criterion_id: "ledger",
            criticality: "critical",
            evidence_requirements: ["screenshot"],
            human_visible_text: "Ledger survives restart"
          }
        ],
        budget_policy: { maxAssignments: 1, maxJobCost: 5, maxRetries: 1 },
        deadline_at: "2026-06-01T00:00:00.000Z",
        idempotency_key: "ledger-restart",
        risk_tier: "low",
        source: { repository: "repo", commit: "abc123", environment: "local", route: "/ledger" }
      }
    });
    const jobId = createResponse.json<{ job_id: string }>().job_id;

    await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/artifacts`,
      payload: {
        manifest_id: "manifest-ledger",
        job_id: jobId,
        raw_artifacts: [
          {
            artifact_id: "artifact-ledger",
            artifact_type: "screenshot",
            content_hash: "hash-ledger",
            provenance: "playwright"
          }
        ],
        artifact_quality: "sufficient",
        environment: { repository: "repo", commit: "abc123", environment: "local", route: "/ledger" }
      }
    });
    await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/privacy-classification`,
      payload: {
        classification_id: "classification-ledger",
        job_id: jobId,
        artifact_manifest_id: "manifest-ledger",
        data_class: "public",
        redaction_status: "completed",
        policy_version: "v1",
        externalization_decision: "allowed",
        audit_record_id: "audit-ledger"
      }
    });
    await app.close();

    const restarted = buildApp(config);
    await restarted.ready();
    const inspection = await restarted.inject({
      method: "GET",
      url: `/runtime/inspection/jobs/${jobId}`
    });
    await restarted.close();

    const body = inspection.json<{ ledger: Array<{ eventType: string }> }>();
    expect(body.ledger.map((entry) => entry.eventType)).toEqual([
      "job.state.created.to.artifacts_collected",
      "job.state.artifacts_collected.to.privacy_classified",
      "privacy.externalization.allowed"
    ]);
  });
});
