import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../../src/api/app.js";

async function createJob(app: ReturnType<typeof buildApp>) {
  const response = await app.inject({
    method: "POST",
    url: "/verification-jobs",
    payload: {
      acceptance_criteria: [
        {
          criterion_id: "page-visible",
          criticality: "critical",
          evidence_requirements: ["screenshot"],
          human_visible_text: "The page is visible"
        }
      ],
      budget_policy: {
        maxJobCost: 10,
        maxAssignments: 2,
        maxRetries: 1
      },
      deadline_at: "2026-06-01T00:00:00.000Z",
      idempotency_key: crypto.randomUUID(),
      risk_tier: "low",
      source: {
        repository: "repo",
        commit: "abc123",
        environment: "staging",
        route: "/demo"
      }
    }
  });

  return response.json().job_id as string;
}

describe("POST /verification-jobs/{jobId}/artifacts", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    app = buildApp();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("accepts an artifact manifest with required hashes and provenance", async () => {
    const jobId = await createJob(app);
    const response = await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/artifacts`,
      payload: {
        manifest_id: "manifest-1",
        job_id: jobId,
        raw_artifacts: [
          {
            artifact_id: "artifact-1",
            artifact_type: "screenshot",
            content_hash: "hash-1",
            provenance: "playwright"
          }
        ],
        artifact_quality: "sufficient",
        environment: {
          repository: "repo",
          commit: "abc123",
          environment: "staging",
          route: "/demo"
        }
      }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({
      manifest_id: "manifest-1",
      job_id: jobId
    });
  });

  it("rejects artifact manifests with missing hashes", async () => {
    const jobId = await createJob(app);
    const response = await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/artifacts`,
      payload: {
        manifest_id: "manifest-2",
        job_id: jobId,
        raw_artifacts: [
          {
            artifact_id: "artifact-2",
            artifact_type: "screenshot",
            content_hash: "",
            provenance: "playwright"
          }
        ],
        artifact_quality: "sufficient",
        environment: {
          repository: "repo",
          commit: "abc123",
          environment: "staging",
          route: "/demo"
        }
      }
    });

    expect(response.statusCode).toBe(400);
  });
});
