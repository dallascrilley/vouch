import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../../src/api/app.js";
import {
  verifyReleaseArtifact,
  type ReleaseArtifact
} from "../../src/domain/feedback/release-artifact.js";

const SIGNING_KEY = "contract-test-signing-key";

function buildSigningApp(signingKey?: string, operatorToken?: string) {
  return buildApp({
    env: {
      ...process.env,
      RELEASE_GATE_SIGNING_KEY: signingKey,
      RUNTIME_OPERATOR_TOKEN: operatorToken
    }
  });
}

async function finalizeJob(app: FastifyInstance) {
  const headers = app.services.runtimeConfig.operatorToken
    ? { "x-operator-token": app.services.runtimeConfig.operatorToken }
    : undefined;
  const jobResponse = await app.inject({
    headers,
    method: "POST",
    url: "/verification-jobs",
    payload: {
      acceptance_criteria: [
        {
          criterion_id: "release-check",
          criticality: "critical",
          evidence_requirements: ["console_summary"],
          human_visible_text: "The release check passes"
        }
      ],
      budget_policy: { maxJobCost: 5, maxAssignments: 1, maxRetries: 1 },
      deadline_at: "2026-06-01T00:00:00.000Z",
      idempotency_key: crypto.randomUUID(),
      risk_tier: "low",
      source: {
        repository: "repo",
        commit: "abc123",
        environment: "ci",
        route: "/verify"
      }
    }
  });
  const jobId = jobResponse.json<{ job_id: string }>().job_id;

  await app.inject({
    headers,
    method: "POST",
    url: `/verification-jobs/${jobId}/artifacts`,
    payload: {
      manifest_id: `manifest-${jobId}`,
      job_id: jobId,
      raw_artifacts: [
        {
          artifact_id: "artifact-release",
          artifact_type: "console_summary",
          content_hash: "hash-release",
          provenance: "check:release"
        }
      ],
      artifact_quality: "sufficient",
      environment: {
        repository: "repo",
        commit: "abc123",
        environment: "ci",
        route: "/verify"
      }
    }
  });

  await app.inject({
    headers,
    method: "POST",
    url: `/verification-jobs/${jobId}/privacy-classification`,
    payload: {
      classification_id: `classification-${jobId}`,
      job_id: jobId,
      artifact_manifest_id: `manifest-${jobId}`,
      data_class: "internal_low",
      redaction_status: "not_required",
      policy_version: "v1",
      externalization_decision: "internal_only",
      audit_record_id: `audit-${jobId}`
    }
  });

  await app.inject({
    headers,
    method: "POST",
    url: `/verification-jobs/${jobId}/self-verification-results`,
    payload: {
      result_id: `result-${jobId}`,
      job_id: jobId,
      confidence: "high",
      recommended_action: "pass",
      criterion_results: [
        { criterion_id: "release-check", status: "pass", confidence: "high" }
      ]
    }
  });

  return jobId;
}

describe("release-artifact contract", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it("returns a signed artifact whose signature verifies and pins the schema", async () => {
    app = buildSigningApp(SIGNING_KEY);
    await app.ready();
    const jobId = await finalizeJob(app);

    const response = await app.inject({
      method: "GET",
      url: `/verification-jobs/${jobId}/release-artifact`
    });
    const artifact = response.json<ReleaseArtifact>();

    expect(response.statusCode).toBe(200);
    expect(Object.keys(artifact).sort()).toEqual([
      "final_verdict",
      "job_id",
      "ledger_attestation_hash",
      "release_gate_effect",
      "signature",
      "signed_at"
    ]);
    expect(artifact).toMatchObject({
      job_id: jobId,
      final_verdict: "pass",
      release_gate_effect: "allow"
    });
    expect(artifact.ledger_attestation_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyReleaseArtifact(artifact, SIGNING_KEY)).toBe(true);

    // Privacy: no raw evidence, hashes and verdict metadata only.
    expect(JSON.stringify(artifact)).not.toContain("hash-release");
  });

  it("rejects tampered payloads", async () => {
    app = buildSigningApp(SIGNING_KEY);
    await app.ready();
    const jobId = await finalizeJob(app);

    const response = await app.inject({
      method: "GET",
      url: `/verification-jobs/${jobId}/release-artifact`
    });
    const artifact = response.json<ReleaseArtifact>();

    const tampered = { ...artifact, final_verdict: "fail" };
    const wrongKey = verifyReleaseArtifact(artifact, "some-other-key");

    expect(verifyReleaseArtifact(tampered, SIGNING_KEY)).toBe(false);
    expect(wrongKey).toBe(false);
  });

  it("requires the operator token when one is configured", async () => {
    app = buildSigningApp(SIGNING_KEY, "release-artifact-operator");
    await app.ready();
    const jobId = await finalizeJob(app);

    const unauthorized = await app.inject({
      method: "GET",
      url: `/verification-jobs/${jobId}/release-artifact`
    });
    const authorized = await app.inject({
      method: "GET",
      url: `/verification-jobs/${jobId}/release-artifact`,
      headers: { "x-operator-token": "release-artifact-operator" }
    });

    expect(unauthorized.statusCode).toBe(401);
    expect(authorized.statusCode).toBe(200);
  });

  it("returns 404 before a verdict exists and 503 without a signing key", async () => {
    app = buildSigningApp(SIGNING_KEY);
    await app.ready();

    const missing = await app.inject({
      method: "GET",
      url: "/verification-jobs/job_unknown/release-artifact"
    });
    expect(missing.statusCode).toBe(404);

    await app.close();
    app = buildSigningApp(undefined);
    await app.ready();
    const disabled = await app.inject({
      method: "GET",
      url: "/verification-jobs/job_unknown/release-artifact"
    });
    expect(disabled.statusCode).toBe(503);
  });
});
