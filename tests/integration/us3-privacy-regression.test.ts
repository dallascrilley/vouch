import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../../src/api/app.js";
import { loadRuntimeConfig } from "../../src/config/runtime.js";

describe("US3 privacy regression", () => {
  let runtimeRoot: string;

  beforeEach(() => {
    runtimeRoot = mkdtempSync(join(tmpdir(), "us3-privacy-"));
  });

  afterEach(() => {
    rmSync(runtimeRoot, { force: true, recursive: true });
  });

  it("preserves fail-closed privacy outcomes after restart", async () => {
    const config = loadRuntimeConfig({
      ...process.env,
      RUNTIME_ARTIFACT_ROOT: join(runtimeRoot, "artifacts"),
      RUNTIME_SQLITE_PATH: join(runtimeRoot, "runtime.sqlite")
    });
    const app = buildApp(config);
    await app.ready();

    const create = await app.inject({
      method: "POST",
      url: "/verification-jobs",
      payload: {
        acceptance_criteria: [
          {
            criterion_id: "privacy",
            criticality: "critical",
            evidence_requirements: ["screenshot"],
            human_visible_text: "Private data remains blocked"
          }
        ],
        budget_policy: { maxAssignments: 1, maxJobCost: 5, maxRetries: 1 },
        deadline_at: "2026-06-01T00:00:00.000Z",
        idempotency_key: "privacy-regression",
        risk_tier: "regulated",
        source: {
          repository: "repo",
          commit: "abc123",
          environment: "local",
          route: "/privacy"
        }
      }
    });
    const jobId = create.json<{ job_id: string }>().job_id;

    await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/artifacts`,
      payload: {
        manifest_id: "manifest-privacy",
        job_id: jobId,
        raw_artifacts: [
          {
            artifact_id: "artifact-privacy",
            artifact_type: "screenshot",
            content_hash: "hash-privacy",
            provenance: "playwright"
          }
        ],
        artifact_quality: "sufficient",
        environment: {
          repository: "repo",
          commit: "abc123",
          environment: "local",
          route: "/privacy"
        }
      }
    });
    await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/privacy-classification`,
      payload: {
        classification_id: "classification-privacy",
        job_id: jobId,
        artifact_manifest_id: "manifest-privacy",
        data_class: "regulated_or_secret",
        redaction_status: "failed",
        policy_version: "v1",
        externalization_decision: "blocked_fail_closed",
        blocked_reasons: ["regulated-data"],
        audit_record_id: "audit-privacy"
      }
    });
    await app.close();

    const restarted = buildApp(config);
    await restarted.ready();
    const verdict = await restarted.inject({
      method: "GET",
      url: `/verification-jobs/${jobId}/verdict`
    });
    const feedback = await restarted.inject({
      method: "GET",
      url: `/verification-jobs/${jobId}/feedback`
    });
    await restarted.close();

    expect(verdict.json()).toMatchObject({ final_verdict: "fail_closed" });
    expect(feedback.json()).toMatchObject({
      final_verdict: "fail_closed",
      policy_constraints: ["regulated-data"]
    });
  });
});
