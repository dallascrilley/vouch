/**
 * Simulated provider E2E: mock dispatch → callback → auto-advance → pass verdict.
 * Proves the in-repo loop without MTurk/bridge.
 */
import { buildApp } from "../src/api/app.js";

type JsonRecord = Record<string, unknown>;

function json<T extends JsonRecord>(response: { json: () => unknown }): T {
  return response.json() as T;
}

async function main() {
  const app = buildApp({
    env: {
      ...process.env,
      PROVIDER_ENABLED: "true",
      PROVIDER_ID: "real-provider",
      PROVIDER_DISPATCH_MODE: "mock",
      PROVIDER_INGESTION_MODE: "callback",
      PROVIDER_API_KEY: "local-test-key",
      PROVIDER_CALLBACK_BASE_URL: "http://localhost:3000",
      PROVIDER_SHARED_SECRET: "top-secret",
      RUNTIME_SQLITE_PATH: ":memory:"
    }
  });
  await app.ready();

  try {
    const create = await app.inject({
      method: "POST",
      url: "/verification-jobs",
      payload: {
        acceptance_criteria: [
          {
            criterion_id: "e2e-check",
            criticality: "critical",
            evidence_requirements: ["screenshot"],
            human_visible_text: "Simulated provider E2E"
          }
        ],
        budget_policy: { maxAssignments: 1, maxJobCost: 5, maxRetries: 1 },
        deadline_at: "2026-06-01T00:00:00.000Z",
        idempotency_key: `sim-e2e-${Date.now()}`,
        risk_tier: "medium",
        source: {
          repository: "repo",
          commit: "local",
          environment: "local",
          route: "/e2e"
        }
      }
    });
    const jobId = json<{ job_id: string }>(create).job_id;

    for (const [url, payload] of [
      [
        `/verification-jobs/${jobId}/artifacts`,
        {
          manifest_id: "manifest-e2e",
          job_id: jobId,
          raw_artifacts: [
            {
              artifact_id: "artifact-e2e",
              artifact_type: "screenshot",
              content_hash: "hash-e2e",
              provenance: "script"
            }
          ],
          artifact_quality: "sufficient",
          environment: {
            repository: "repo",
            commit: "local",
            environment: "local",
            route: "/e2e"
          }
        }
      ],
      [
        `/verification-jobs/${jobId}/privacy-classification`,
        {
          classification_id: "classification-e2e",
          job_id: jobId,
          artifact_manifest_id: "manifest-e2e",
          data_class: "internal_low",
          redaction_status: "completed",
          allowed_reviewer_routes: ["managed"],
          policy_version: "v1",
          externalization_decision: "allowed",
          audit_record_id: "audit-e2e"
        }
      ]
    ] as const) {
      const res = await app.inject({ method: "POST", url, payload });
      if (res.statusCode >= 400) {
        throw new Error(`${url} failed: ${res.body}`);
      }
    }

    const task = await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/human-review-tasks`,
      payload: {
        criterion_ids: ["e2e-check"],
        deadline_at: "2026-06-01T00:00:00.000Z",
        provider_adapter: "real-provider",
        quality_policy: "provider-managed",
        reviewer_pool: "managed",
        sanitized_package_id: "e2e-package",
        task_template: "e2e-template"
      }
    });
    const taskPayload = json<{ provider_task_id: string }>(task);

    const callback = await app.inject({
      method: "POST",
      url: "/provider-callback",
      payload: {
        provider_id: "real-provider",
        provider_task_id: taskPayload.provider_task_id,
        provider_response_id: `sim-${Date.now()}`,
        reviewer_pseudonymous_id: "sim-reviewer",
        overall_verdict: "pass",
        criterion_results: [
          { criterion_id: "e2e-check", status: "pass", confidence: "high" }
        ],
        defect_category: "none",
        evidence_note: "Simulated pass",
        severity: "S4",
        shared_secret: "top-secret"
      }
    });

    const feedback = await app.inject({
      method: "GET",
      url: `/verification-jobs/${jobId}/feedback`
    });

    const callbackBody = json<{ auto_advanced?: boolean }>(callback);
    const feedbackBody = json<{ final_verdict?: string }>(feedback);

    if (callback.statusCode !== 202 || !callbackBody.auto_advanced) {
      throw new Error(`callback did not auto-advance: ${callback.body}`);
    }
    if (feedbackBody.final_verdict !== "pass") {
      throw new Error(
        `expected pass verdict, got ${JSON.stringify(feedbackBody)}`
      );
    }

    console.log(
      JSON.stringify(
        {
          auto_advanced: callbackBody.auto_advanced,
          final_verdict: feedbackBody.final_verdict,
          job_id: jobId,
          provider_task_id: taskPayload.provider_task_id,
          status: "simulated provider e2e passed"
        },
        null,
        2
      )
    );
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
