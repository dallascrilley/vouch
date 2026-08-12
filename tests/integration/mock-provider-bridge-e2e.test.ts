import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildMockProviderBridge } from "../../scripts/lib/mock-provider-bridge.js";
import { buildApp } from "../../src/api/app.js";

describe("mock second-provider bridge e2e", () => {
  let app: ReturnType<typeof buildApp>;
  let mockBridge: ReturnType<typeof buildMockProviderBridge>;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "mock-provider-bridge-"));
    const bridgeApiKey = "local-bridge-key";
    const sharedSecret = "top-secret";

    app = buildApp({
      env: {
        ...process.env,
        PROVIDER_ENABLED: "true",
        PROVIDER_ID: "mock-second-provider",
        PROVIDER_DISPATCH_MODE: "api",
        PROVIDER_INGESTION_MODE: "callback",
        PROVIDER_API_KEY: bridgeApiKey,
        PROVIDER_CALLBACK_BASE_URL: "http://broker.test",
        PROVIDER_DISPATCH_URL: "http://mock-provider.test/dispatch",
        PROVIDER_SHARED_SECRET: sharedSecret
      },
      fetchImpl: async (input, init) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        if (url === "http://mock-provider.test/dispatch") {
          const injected = await mockBridge.inject({
            method: "POST",
            url: "/dispatch",
            headers: init?.headers as Record<string, string>,
            payload: JSON.parse(init?.body as string)
          });
          return injectAsFetchResponse(injected as unknown as InjectedResponse);
        }
        throw new Error(`Unexpected broker fetch URL: ${url}`);
      }
    });

    mockBridge = buildMockProviderBridge({
      apiKey: bridgeApiKey,
      brokerCallbackUrl: "http://broker.test/provider-callback",
      fetchImpl: async (input, init) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        if (url === "http://broker.test/provider-callback") {
          const injected = await app.inject({
            method: "POST",
            url: "/provider-callback",
            headers: init?.headers as Record<string, string>,
            payload: JSON.parse(init?.body as string)
          });
          return injectAsFetchResponse(injected as unknown as InjectedResponse);
        }
        throw new Error(`Unexpected mock bridge fetch URL: ${url}`);
      },
      maxCallbackAttempts: 3,
      providerId: "mock-second-provider",
      sharedSecret,
      statePath: join(tempDir, "mock-provider-state.json")
    });

    await app.ready();
    await mockBridge.ready();
  });

  afterEach(async () => {
    await mockBridge.close();
    await app.close();
    rmSync(tempDir, { force: true, recursive: true });
  });

  it("lets an agent commission ambiguous evidence review and consume an unambiguous retry decision", async () => {
    const jobId = await createProviderEligibleJob(app);
    const taskResponse = await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/human-review-tasks`,
      payload: {
        criterion_ids: ["managed-check"],
        deadline_at: "2026-06-01T00:00:00.000Z",
        provider_adapter: "mock-second-provider",
        quality_policy: "provider-managed",
        reviewer_pool: "managed",
        sanitized_package_id: "managed-package",
        task_template: "provider-template"
      }
    });
    const taskPayload = taskResponse.json();

    expect(taskResponse.statusCode).toBe(202);
    expect(taskPayload).toMatchObject({
      dispatch_status: "dispatched",
      provider_task_id: expect.stringMatching(/^mock_task_review_/)
    });

    const response = await mockBridge.inject({
      method: "POST",
      url: "/responses",
      headers: {
        authorization: "Bearer local-bridge-key"
      },
      payload: {
        provider_task_id: taskPayload.provider_task_id,
        provider_response_id: "mock-provider-response-1",
        reviewer_pseudonymous_id: "mock-worker-1",
        overall_verdict: "unclear",
        criterion_results: [
          {
            criterion_id: "managed-check",
            status: "unclear",
            confidence: "medium"
          }
        ],
        defect_category: "ambiguous_evidence",
        evidence_note: "Mock provider could not verify the supplied evidence.",
        severity: "S2"
      }
    });
    // Ambiguous provider responses stay manual under the honest-provenance
    // model: the agent (or operator) resolves via consensus + adjudication.
    const consensusResponse = await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/consensus`,
      payload: {
        adjudication_trigger: "provider_ambiguous_callback",
        artifact_sufficiency: "sufficient",
        disagreement_level: "medium",
        quorum_state: "met",
        recommended_outcome: "adjudicate",
        review_task_id: taskPayload.review_task_id,
        severity_summary: "S2",
        valid_response_count: 1
      }
    });
    const adjudicationResponse = await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/adjudications`,
      payload: {
        assigned_pool: "internal",
        decision: "retry",
        trigger_reason: "mock provider could not verify the supplied evidence"
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
    const bridgeStateResponse = await mockBridge.inject({
      method: "GET",
      url: "/state",
      headers: {
        authorization: "Bearer local-bridge-key"
      }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      attempts: 1,
      delivered: true,
      provider_response_id: "mock-provider-response-1"
    });
    expect(consensusResponse.statusCode).toBe(202);
    expect(adjudicationResponse.statusCode).toBe(202);
    expect(verdictResponse.json()).toMatchObject({
      final_verdict: "retry"
    });
    expect(feedbackResponse.json()).toMatchObject({
      agent_next_action: "retry",
      failed_criteria: ["managed-check"],
      final_verdict: "retry",
      provider_response_ids: ["mock-provider-response-1"],
      retry_allowed: true
    });
    expect(bridgeStateResponse.json()).toMatchObject({
      totals: {
        deliveredAssignments: 1,
        tasks: 1
      }
    });
  });
});

async function createProviderEligibleJob(app: ReturnType<typeof buildApp>) {
  const createResponse = await app.inject({
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
      agent_run_id: "agent-run-phase-6",
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

type InjectedResponse = {
  body: string;
  headers: Record<string, string | string[] | undefined>;
  statusCode: number;
};

function injectAsFetchResponse(response: InjectedResponse) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(response.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(name, item);
      }
    } else if (value) {
      headers.set(name, value);
    }
  }
  return new Response(response.body, {
    headers,
    status: response.statusCode
  });
}
