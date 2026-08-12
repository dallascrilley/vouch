import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildApp } from "../src/api/app.js";
import { loadRuntimeConfig } from "../src/config/runtime.js";

async function main() {
  const runtimeRoot = mkdtempSync(join(tmpdir(), "local-runtime-"));
  const databasePath = join(runtimeRoot, "runtime.sqlite");
  const artifactRoot = join(runtimeRoot, "artifacts");
  const config = loadRuntimeConfig({
    ...process.env,
    RUNTIME_ARTIFACT_ROOT: artifactRoot,
    RUNTIME_SQLITE_PATH: databasePath
  });

  const app = buildApp(config);
  await app.ready();

  const createResponse = await app.inject({
    method: "POST",
    url: "/verification-jobs",
    payload: {
      acceptance_criteria: [
        {
          criticality: "critical",
          criterion_id: "runtime-validation",
          evidence_requirements: ["screenshot"],
          human_visible_text: "Runtime validation path persists state"
        }
      ],
      budget_policy: {
        maxAssignments: 1,
        maxJobCost: 5,
        maxRetries: 1
      },
      deadline_at: "2026-06-01T00:00:00.000Z",
      idempotency_key: "runtime-validation",
      risk_tier: "low",
      source: {
        commit: "validation",
        environment: "local",
        repository: "quorum",
        route: "/validation"
      }
    }
  });

  const createBody = createResponse.json<{ job_id: string }>();
  const jobId = createBody.job_id;

  await app.inject({
    method: "POST",
    url: `/verification-jobs/${jobId}/artifacts`,
    payload: {
      artifact_quality: "sufficient",
      environment: {
        commit: "validation",
        environment: "local",
        repository: "quorum",
        route: "/validation"
      },
      job_id: jobId,
      manifest_id: "runtime-validation-manifest",
      raw_artifacts: [
        {
          artifact_id: "artifact-validation",
          artifact_type: "screenshot",
          content_hash: "hash-validation",
          provenance: "local-proof"
        }
      ]
    }
  });

  await app.inject({
    method: "POST",
    url: `/verification-jobs/${jobId}/privacy-classification`,
    payload: {
      artifact_manifest_id: "runtime-validation-manifest",
      audit_record_id: "audit-validation",
      classification_id: "privacy-validation",
      data_class: "public",
      externalization_decision: "allowed",
      job_id: jobId,
      policy_version: "v1",
      redaction_status: "completed"
    }
  });

  await app.inject({
    method: "POST",
    url: `/verification-jobs/${jobId}/self-verification-results`,
    payload: {
      confidence: "high",
      criterion_results: [
        {
          confidence: "high",
          criterion_id: "runtime-validation",
          status: "pass"
        }
      ],
      job_id: jobId,
      recommended_action: "pass",
      result_id: "result-validation"
    }
  });

  const inspection = await app.inject({
    method: "GET",
    url: `/runtime/inspection/jobs/${jobId}`
  });

  await app.close();
  rmSync(runtimeRoot, { force: true, recursive: true });

  if (inspection.statusCode !== 200) {
    throw new Error(`Runtime inspection failed with status ${inspection.statusCode}`);
  }

  const body = inspection.json<{
    job: { state: string };
    verdict?: { finalVerdict: string };
  }>();
  if (body.job.state !== "final_pass" || body.verdict?.finalVerdict !== "pass") {
    throw new Error("Runtime validation did not persist a final pass verdict");
  }

  console.log("local runtime validation passed");
}

void main();
