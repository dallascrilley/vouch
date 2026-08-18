import type { FastifyInstance } from "fastify";
import { vi } from "vitest";

import { buildApp } from "../../src/api/app.js";

export type ProviderTestAppOptions = {
  dispatchMode?: "api" | "mock";
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  ingestionMode?: "callback" | "poll";
  operatorToken?: string;
};

export function buildProviderTestApp(options: ProviderTestAppOptions = {}) {
  return buildApp({
    env: {
      ...process.env,
      PROVIDER_ENABLED: "true",
      PROVIDER_ID: "real-provider",
      PROVIDER_DISPATCH_MODE: options.dispatchMode ?? "mock",
      PROVIDER_INGESTION_MODE: options.ingestionMode ?? "callback",
      PROVIDER_API_KEY: "local-test-key",
      PROVIDER_CALLBACK_BASE_URL: "http://localhost:3000",
      PROVIDER_SHARED_SECRET: "top-secret",
      RUNTIME_OPERATOR_TOKEN:
        options.operatorToken ?? process.env.RUNTIME_OPERATOR_TOKEN,
      ...options.env
    },
    fetchImpl: options.fetchImpl ?? vi.fn()
  });
}

export async function createProviderEligibleJob(app: FastifyInstance) {
  const headers = app.services.runtimeConfig.operatorToken
    ? { "x-operator-token": app.services.runtimeConfig.operatorToken }
    : undefined;
  const createResponse = await app.inject({
    headers,
    method: "POST",
    url: "/verification-jobs",
    payload: {
      acceptance_criteria: [
        {
          criterion_id: "managed-check",
          criticality: "critical",
          evidence_requirements: ["screenshot"],
          human_visible_text: "The managed provider check passes"
        }
      ],
      budget_policy: {
        maxJobCost: 10,
        maxAssignments: 2,
        maxRetries: 1
      },
      deadline_at: "2026-06-01T00:00:00.000Z",
      idempotency_key: crypto.randomUUID(),
      risk_tier: "medium",
      source: {
        repository: "repo",
        commit: "abc123",
        environment: "staging",
        route: "/managed"
      }
    }
  });
  const jobId = createResponse.json().job_id as string;

  await app.inject({
    headers,
    method: "POST",
    url: `/verification-jobs/${jobId}/artifacts`,
    payload: {
      manifest_id: "manifest-managed",
      job_id: jobId,
      raw_artifacts: [
        {
          artifact_id: "artifact-managed",
          artifact_type: "screenshot",
          content_hash: "hash-managed",
          provenance: "playwright"
        }
      ],
      artifact_quality: "sufficient",
      environment: {
        repository: "repo",
        commit: "abc123",
        environment: "staging",
        route: "/managed"
      }
    }
  });

  await app.inject({
    headers,
    method: "POST",
    url: `/verification-jobs/${jobId}/privacy-classification`,
    payload: {
      classification_id: "classification-managed",
      job_id: jobId,
      artifact_manifest_id: "manifest-managed",
      data_class: "internal_low",
      redaction_status: "completed",
      allowed_reviewer_routes: ["managed"],
      policy_version: "v1",
      externalization_decision: "allowed",
      audit_record_id: "audit-managed"
    }
  });

  return jobId;
}
