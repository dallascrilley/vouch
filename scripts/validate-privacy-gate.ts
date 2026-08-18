import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildApp } from "../src/api/app.js";
import { loadRuntimeConfig } from "../src/config/runtime.js";

// Offline proof for the privacy gate (launch criterion V3).
//
// The other harnesses drive allowed paths, so every rejection branch was
// covered only by unit and integration tests. That gap is how a dead /billing
// policy rule and a stranded-job defect both survived a green suite. This
// harness drives the real service through the *rejection* paths, plus one
// allowed control so it cannot pass by blocking everything.

type App = ReturnType<typeof buildApp>;

const SOURCE = {
  commit: "validation",
  environment: "local",
  repository: "vouch"
};

async function seedJob(app: App, route: string): Promise<string> {
  const created = await app.inject({
    method: "POST",
    url: "/verification-jobs",
    payload: {
      acceptance_criteria: [
        {
          criticality: "critical",
          criterion_id: "privacy-check",
          evidence_requirements: ["screenshot"],
          human_visible_text: "The privacy gate holds"
        }
      ],
      budget_policy: { maxAssignments: 1, maxJobCost: 5, maxRetries: 1 },
      deadline_at: "2026-06-01T00:00:00.000Z",
      idempotency_key: `privacy-${crypto.randomUUID()}`,
      risk_tier: "medium",
      source: { ...SOURCE, route }
    }
  });
  const jobId = created.json<{ job_id: string }>().job_id;

  await app.inject({
    method: "POST",
    url: `/verification-jobs/${jobId}/artifacts`,
    payload: {
      artifact_quality: "sufficient",
      environment: { ...SOURCE, route },
      job_id: jobId,
      manifest_id: `manifest-${jobId}`,
      raw_artifacts: [
        {
          artifact_id: "artifact-privacy",
          artifact_type: "screenshot",
          content_hash: "hash-privacy",
          provenance: "playwright"
        }
      ]
    }
  });

  return jobId;
}

async function classify(
  app: App,
  jobId: string,
  options: {
    dataClass: string;
    redactionStatus?: string;
    allowedReviewerRoutes?: string[];
  }
) {
  return app.inject({
    method: "POST",
    url: `/verification-jobs/${jobId}/privacy-classification`,
    payload: {
      artifact_manifest_id: `manifest-${jobId}`,
      audit_record_id: `audit-${jobId}`,
      allowed_reviewer_routes: options.allowedReviewerRoutes ?? ["managed"],
      classification_id: `classification-${jobId}`,
      data_class: options.dataClass,
      // The client always asserts "allowed". The server must not trust it.
      externalization_decision: "allowed",
      job_id: jobId,
      policy_version: "v1",
      redaction_status: options.redactionStatus ?? "completed"
    }
  });
}

function requestReview(app: App, jobId: string, reviewerPool: string) {
  return app.inject({
    method: "POST",
    url: `/verification-jobs/${jobId}/human-review-tasks`,
    payload: {
      criterion_ids: ["privacy-check"],
      deadline_at: "2026-06-01T00:00:00.000Z",
      quality_policy: "single-reviewer",
      reviewer_pool: reviewerPool,
      sanitized_package_id: `package-${jobId}`,
      task_template: "privacy-template"
    }
  });
}

function check(label: string, condition: boolean, detail: string): void {
  if (!condition) {
    throw new Error(`${label} failed: ${detail}`);
  }
  console.log(`  ${label} ok`);
}

async function jobState(app: App, jobId: string): Promise<string> {
  const response = await app.inject({
    method: "GET",
    url: `/verification-jobs/${jobId}`
  });
  return response.json<{ state: string }>().state;
}

async function main() {
  const runtimeRoot = mkdtempSync(join(tmpdir(), "privacy-gate-"));
  const config = loadRuntimeConfig({
    ...process.env,
    RUNTIME_ARTIFACT_ROOT: join(runtimeRoot, "artifacts"),
    RUNTIME_SQLITE_PATH: join(runtimeRoot, "runtime.sqlite")
  });
  const app = buildApp(config);
  await app.ready();

  try {
    // 1. Regulated or secret evidence never leaves the internal pool, however
    //    the client classified it.
    const regulated = await seedJob(app, "/checkout");
    await classify(app, regulated, { dataClass: "regulated_or_secret" });
    const regulatedBlocked = await requestReview(app, regulated, "managed");
    check(
      "regulated evidence is blocked from the managed pool",
      regulatedBlocked.statusCode === 403,
      `expected 403, got ${regulatedBlocked.statusCode}`
    );

    // 2. A rejection must not advance the job. A 403 that still queued the job
    //    left it undispatchable forever.
    check(
      "a blocked request leaves the job unadvanced",
      (await jobState(app, regulated)) === "privacy_classified",
      `job moved to ${await jobState(app, regulated)}`
    );

    // 3. Route-based rules are live, not just present. This one was
    //    unreachable in shipped code because the gate recomputed the policy
    //    with an empty route.
    const billing = await seedJob(app, "/billing/invoices");
    await classify(app, billing, { dataClass: "internal_low" });
    const billingBlocked = await requestReview(app, billing, "managed");
    check(
      "billing routes are blocked from the managed pool",
      billingBlocked.statusCode === 403,
      `expected 403, got ${billingBlocked.statusCode}`
    );

    // 4. Failed redaction fails closed with a terminal verdict, not a retry.
    const redaction = await seedJob(app, "/checkout");
    await classify(app, redaction, {
      dataClass: "internal_low",
      redactionStatus: "failed"
    });
    const verdict = await app.inject({
      method: "GET",
      url: `/verification-jobs/${redaction}/verdict`
    });
    const verdictBody = verdict.json<{ final_verdict?: string }>();
    check(
      "failed redaction fails closed",
      verdictBody.final_verdict === "fail_closed",
      `expected fail_closed, got ${JSON.stringify(verdictBody)}`
    );

    const feedback = await app.inject({
      method: "GET",
      url: `/verification-jobs/${redaction}/feedback`
    });
    check(
      "a fail-closed job is not offered a retry",
      feedback.json<{ retry_allowed?: boolean }>().retry_allowed === false,
      `expected retry_allowed false, got ${JSON.stringify(feedback.json())}`
    );

    // 5. Control. Without this the harness would pass by rejecting everything.
    const allowed = await seedJob(app, "/checkout");
    await classify(app, allowed, { dataClass: "internal_low" });
    const allowedResponse = await requestReview(app, allowed, "managed");
    check(
      "an allowed classification still dispatches",
      allowedResponse.statusCode === 202,
      `expected 202, got ${allowedResponse.statusCode} ${allowedResponse.body}`
    );

    console.log(
      JSON.stringify({
        status: "privacy gate validation passed",
        checks: 6,
        simulated: true
      })
    );
  } finally {
    await app.close();
    rmSync(runtimeRoot, { force: true, recursive: true });
  }
}

void main();
