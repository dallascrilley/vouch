import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type VisualEvidenceManifest = {
  artifact_id: string;
  caption: string;
  content_hash: string;
  data_url: string;
  embedded_image_path?: string;
  screenshot_path: string;
  viewport: string;
};

async function main() {
  const baseUrl = process.env.BROKER_BASE_URL ?? "http://127.0.0.1:3000";
  const manifestPath = resolve(
    process.env.VISUAL_QA_MANIFEST_PATH ??
      ".runtime/visual-qa/hero-cta-overlap-1440x900.json"
  );
  const evidence = JSON.parse(
    readFileSync(manifestPath, "utf8")
  ) as VisualEvidenceManifest;
  const suffix =
    process.env.MTURK_VISUAL_QA_IDEMPOTENCY_SUFFIX ??
    new Date().toISOString().replace(/[-:.]/g, "");
  const idempotencyKey = `mturk-visual-hero-cta-${suffix}`;
  const commit = process.env.SOURCE_COMMIT ?? currentGitCommit();

  const createResponse = await postJson(`${baseUrl}/verification-jobs`, {
    acceptance_criteria: [
      {
        criterion_id: "hero-cta-no-overlap",
        criticality: "major",
        evidence_requirements: ["screenshot"],
        human_visible_text:
          "The orange Commission review CTA is visually below the hero headline and does not overlap it at 1440x900."
      }
    ],
    agent_run_id: process.env.AGENT_RUN_ID ?? `visual-qa-agent-${suffix}`,
    budget_policy: {
      maxAssignments: 1,
      maxJobCost: 5,
      maxRetries: 1
    },
    deadline_at: "2026-06-30T00:00:00.000Z",
    idempotency_key: idempotencyKey,
    risk_tier: "medium",
    source: {
      commit,
      environment: "visual-fixture",
      feature_flags: ["visual-qa-fixture"],
      repository: "vouch",
      route: "/fixtures/visual-qa/hero-cta-overlap.html",
      viewport: evidence.viewport
    }
  });
  const createPayload = (await createResponse.json()) as { job_id: string };

  await postJson(
    `${baseUrl}/verification-jobs/${createPayload.job_id}/artifacts`,
    {
      artifact_quality: "sufficient",
      environment: {
        commit,
        environment: "visual-fixture",
        feature_flags: ["visual-qa-fixture"],
        repository: "vouch",
        route: "/fixtures/visual-qa/hero-cta-overlap.html",
        viewport: evidence.viewport
      },
      job_id: createPayload.job_id,
      manifest_id: `${idempotencyKey}-manifest`,
      raw_artifacts: [
        {
          artifact_id: evidence.artifact_id,
          artifact_type: "screenshot",
          content_hash: evidence.content_hash,
          provenance: evidence.screenshot_path
        }
      ],
      sanitized_packages: [
        {
          externalization_decision: "allowed",
          package_hash: evidence.content_hash,
          package_id: `${idempotencyKey}-package`,
          redaction_policy_version: "visual-fixture-v1",
          transform_hash: evidence.content_hash
        }
      ]
    }
  );

  await postJson(
    `${baseUrl}/verification-jobs/${createPayload.job_id}/privacy-classification`,
    {
      allowed_reviewer_routes: ["managed"],
      artifact_manifest_id: `${idempotencyKey}-manifest`,
      audit_record_id: `${idempotencyKey}-audit`,
      classification_id: `${idempotencyKey}-classification`,
      data_class: "internal_low",
      externalization_decision: "allowed",
      job_id: createPayload.job_id,
      policy_version: "v1",
      redaction_status: "completed"
    }
  );

  const taskResponse = await postJson(
    `${baseUrl}/verification-jobs/${createPayload.job_id}/human-review-tasks`,
    {
      criterion_ids: ["hero-cta-no-overlap"],
      deadline_at: "2026-06-30T00:00:00.000Z",
      provider_adapter: "real-provider",
      quality_policy: "provider-managed",
      reviewer_pool: "managed",
      sanitized_package_id: `${idempotencyKey}-package`,
      task_template:
        "Review the embedded screenshot. Decide whether the orange Commission review CTA overlaps the hero headline.",
      visual_evidence: {
        artifact_id: evidence.artifact_id,
        caption: evidence.caption,
        content_hash: evidence.content_hash,
        data_url: evidence.data_url,
        viewport: evidence.viewport
      }
    }
  );
  const taskPayload = (await taskResponse.json()) as {
    provider_task_id?: string;
    review_task_id: string;
  };

  console.log(
    JSON.stringify(
      {
        job_id: createPayload.job_id,
        provider_task_id: taskPayload.provider_task_id,
        review_task_id: taskPayload.review_task_id,
        worker_url_hint: taskPayload.provider_task_id
          ? "Use aws mturk get-hit to resolve HITTypeId, then open https://workersandbox.mturk.com/projects/<HITTypeId>/tasks?ref=w_pl_prvw"
          : undefined
      },
      null,
      2
    )
  );
}

async function postJson(url: string, payload: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(
      `${url} failed: ${response.status} ${await response.text()}`
    );
  }
  return response;
}

function currentGitCommit() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8"
    }).trim();
  } catch {
    return "unknown";
  }
}

void main();
