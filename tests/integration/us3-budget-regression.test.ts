import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../../src/api/app.js";
import { evaluateBudgetPolicy } from "../../src/domain/jobs/budget-policy.js";

describe("US3 budget regression", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    app = buildApp();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("preserves retry feedback semantics for retry verdicts", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/verification-jobs",
      payload: {
        acceptance_criteria: [
          {
            criterion_id: "retry",
            criticality: "critical",
            evidence_requirements: ["screenshot"],
            human_visible_text: "Retry semantics survive"
          }
        ],
        budget_policy: { maxAssignments: 1, maxJobCost: 5, maxRetries: 1 },
        deadline_at: "2026-06-01T00:00:00.000Z",
        idempotency_key: "retry-regression",
        risk_tier: "low",
        source: { repository: "repo", commit: "abc123", environment: "local", route: "/retry" }
      }
    });
    const jobId = create.json<{ job_id: string }>().job_id;

    await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/artifacts`,
      payload: {
        manifest_id: "manifest-retry",
        job_id: jobId,
        raw_artifacts: [
          {
            artifact_id: "artifact-retry",
            artifact_type: "screenshot",
            content_hash: "hash-retry",
            provenance: "playwright"
          }
        ],
        artifact_quality: "sufficient",
        environment: { repository: "repo", commit: "abc123", environment: "local", route: "/retry" }
      }
    });
    await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/privacy-classification`,
      payload: {
        classification_id: "classification-retry",
        job_id: jobId,
        artifact_manifest_id: "manifest-retry",
        data_class: "public",
        redaction_status: "completed",
        policy_version: "v1",
        externalization_decision: "allowed",
        audit_record_id: "audit-retry"
      }
    });
    await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/self-verification-results`,
      payload: {
        result_id: "result-retry",
        job_id: jobId,
        confidence: "medium",
        recommended_action: "retry",
        criterion_results: [
          {
            criterion_id: "retry",
            status: "unclear",
            confidence: "medium"
          }
        ]
      }
    });

    const feedback = await app.inject({ method: "GET", url: `/verification-jobs/${jobId}/feedback` });
    expect(feedback.json()).toMatchObject({
      final_verdict: "retry",
      retry_allowed: true,
      retry_reason: "Automated verification requested retry"
    });
  });

  it("still blocks when budget caps are exceeded", () => {
    const evaluation = evaluateBudgetPolicy(
      {
        maxAssignments: 1,
        maxJobCost: 5,
        maxRetries: 1
      },
      {
        assignmentCount: 2,
        jobCost: 10,
        retriesUsed: 2
      },
      "low"
    );

    expect(evaluation).toEqual({
      allowed: false,
      blockingCaps: ["maxJobCost", "maxAssignments", "maxRetries"]
    });
  });
});
