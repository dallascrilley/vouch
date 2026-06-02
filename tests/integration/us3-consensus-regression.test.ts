import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../../src/api/app.js";
import { loadRuntimeConfig } from "../../src/config/runtime.js";

describe("US3 consensus regression", () => {
  let runtimeRoot: string;

  beforeEach(() => {
    runtimeRoot = mkdtempSync(join(tmpdir(), "us3-consensus-"));
  });

  afterEach(() => {
    rmSync(runtimeRoot, { force: true, recursive: true });
  });

  it("persists consensus and adjudication outcomes across restart", async () => {
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
            criterion_id: "consensus",
            criticality: "critical",
            evidence_requirements: ["screenshot"],
            human_visible_text: "Consensus survives restart"
          }
        ],
        budget_policy: { maxAssignments: 3, maxJobCost: 10, maxRetries: 1 },
        deadline_at: "2026-06-01T00:00:00.000Z",
        idempotency_key: "consensus-regression",
        risk_tier: "high",
        source: { repository: "repo", commit: "abc123", environment: "local", route: "/consensus" }
      }
    });
    const jobId = create.json<{ job_id: string }>().job_id;

    await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/artifacts`,
      payload: {
        manifest_id: "manifest-consensus",
        job_id: jobId,
        raw_artifacts: [
          {
            artifact_id: "artifact-consensus",
            artifact_type: "screenshot",
            content_hash: "hash-consensus",
            provenance: "playwright"
          }
        ],
        artifact_quality: "sufficient",
        environment: { repository: "repo", commit: "abc123", environment: "local", route: "/consensus" }
      }
    });
    await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/privacy-classification`,
      payload: {
        classification_id: "classification-consensus",
        job_id: jobId,
        artifact_manifest_id: "manifest-consensus",
        data_class: "sensitive_internal",
        redaction_status: "completed",
        policy_version: "v1",
        externalization_decision: "allowed",
        audit_record_id: "audit-consensus"
      }
    });
    const task = await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/human-review-tasks`,
      payload: {
        criterion_ids: ["consensus"],
        deadline_at: "2026-06-01T01:00:00.000Z",
        quality_policy: "three-reviewers",
        reviewer_pool: "internal",
        sanitized_package_id: "pkg-consensus",
        task_template: "visual-check"
      }
    });
    const reviewTaskId = task.json<{ review_task_id: string }>().review_task_id;
    await app.inject({
      method: "POST",
      url: `/human-review-tasks/${reviewTaskId}/responses`,
      payload: {
        confidence: "high",
        criterion_results: [{ criterion_id: "consensus", status: "fail", confidence: "high" }],
        defect_category: "blocking-error",
        evidence_note: "A blocking error is visible.",
        overall_verdict: "fail",
        reviewer_pseudonymous_id: "reviewer-consensus",
        severity: "S0"
      }
    });
    await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/consensus`,
      payload: {
        adjudication_trigger: "credible-severe-minority",
        artifact_sufficiency: "sufficient",
        disagreement_level: "high",
        quorum_state: "met",
        recommended_outcome: "adjudicate",
        review_task_id: reviewTaskId,
        severity_summary: "S0",
        valid_response_count: 1
      }
    });
    await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/adjudications`,
      payload: {
        assigned_pool: "internal",
        decision: "fail",
        trigger_reason: "credible severe minority report"
      }
    });
    await app.close();

    const restarted = buildApp(config);
    await restarted.ready();
    const inspection = await restarted.inject({ method: "GET", url: `/runtime/inspection/jobs/${jobId}` });
    await restarted.close();

    expect(inspection.json()).toMatchObject({
      consensus: { recommendedOutcome: "adjudicate" },
      adjudication: { decision: "fail" },
      verdict: { finalVerdict: "fail" }
    });
  });
});
