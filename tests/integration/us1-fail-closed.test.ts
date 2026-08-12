import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../../src/api/app.js";

describe("US1 fail-closed privacy outcome", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    app = buildApp();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("blocks the job when privacy classification requires fail-closed behavior", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/verification-jobs",
      payload: {
        acceptance_criteria: [
          {
            criterion_id: "billing-state",
            criticality: "critical",
            evidence_requirements: ["screenshot"],
            human_visible_text: "The billing state is visible"
          }
        ],
        budget_policy: {
          maxJobCost: 10,
          maxAssignments: 2,
          maxRetries: 1
        },
        deadline_at: "2026-06-01T00:00:00.000Z",
        idempotency_key: "fail-closed",
        risk_tier: "regulated",
        source: {
          repository: "repo",
          commit: "abc123",
          environment: "staging",
          route: "/billing"
        }
      }
    });
    const jobId = createResponse.json().job_id as string;

    await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/artifacts`,
      payload: {
        manifest_id: "manifest-fail-closed",
        job_id: jobId,
        raw_artifacts: [
          {
            artifact_id: "artifact-fail-closed",
            artifact_type: "screenshot",
            content_hash: "hash-fail-closed",
            provenance: "playwright"
          }
        ],
        artifact_quality: "sufficient",
        environment: {
          repository: "repo",
          commit: "abc123",
          environment: "staging",
          route: "/billing"
        }
      }
    });

    await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/privacy-classification`,
      payload: {
        classification_id: "classification-fail-closed",
        job_id: jobId,
        artifact_manifest_id: "manifest-fail-closed",
        data_class: "regulated_or_secret",
        redaction_status: "failed",
        policy_version: "v1",
        externalization_decision: "blocked_fail_closed",
        blocked_reasons: ["regulated data detected"],
        audit_record_id: "audit-fail-closed"
      }
    });

    const verdictResponse = await app.inject({
      method: "GET",
      url: `/verification-jobs/${jobId}/verdict`
    });
    const feedbackResponse = await app.inject({
      method: "GET",
      url: `/verification-jobs/${jobId}/feedback`
    });
    const jobResponse = await app.inject({
      method: "GET",
      url: `/verification-jobs/${jobId}`
    });

    expect(verdictResponse.json().final_verdict).toBe("fail_closed");
    expect(feedbackResponse.json().policy_constraints).toEqual([
      "regulated data detected"
    ]);
    expect(jobResponse.json().state).toBe("fail_closed");
  });
});
