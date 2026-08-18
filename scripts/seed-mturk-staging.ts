type TestCase = {
  artifact: {
    artifact_id: string;
    artifact_type: "screenshot";
    content_hash: string;
    provenance: string;
  };
  criterion: {
    criterion_id: string;
    criticality: "critical" | "major" | "minor";
    evidence_requirements: string[];
    human_visible_text: string;
  };
  idempotency_key: string;
  risk_tier: "low" | "medium";
  route: string;
  summary: string;
};

const cases: TestCase[] = [
  {
    artifact: {
      artifact_id: "artifact-layout-overlap",
      artifact_type: "screenshot",
      content_hash: "hash-layout-overlap",
      provenance: "staging-playwright"
    },
    criterion: {
      criterion_id: "hero-no-overlap",
      criticality: "major",
      evidence_requirements: ["screenshot"],
      human_visible_text:
        "Hero headline and CTA do not overlap on 1440px desktop."
    },
    idempotency_key: "mturk-layout-overlap",
    risk_tier: "medium",
    route: "/staging/layout-overlap",
    summary: "Ambiguous desktop overlap regression"
  },
  {
    artifact: {
      artifact_id: "artifact-modal-focus",
      artifact_type: "screenshot",
      content_hash: "hash-modal-focus",
      provenance: "staging-playwright"
    },
    criterion: {
      criterion_id: "modal-focus-visible",
      criticality: "critical",
      evidence_requirements: ["screenshot"],
      human_visible_text: "Primary modal action has a visible focus state."
    },
    idempotency_key: "mturk-modal-focus",
    risk_tier: "medium",
    route: "/staging/modal-focus",
    summary: "Focus-ring ambiguity on primary modal action"
  },
  {
    artifact: {
      artifact_id: "artifact-empty-state",
      artifact_type: "screenshot",
      content_hash: "hash-empty-state",
      provenance: "staging-playwright"
    },
    criterion: {
      criterion_id: "empty-state-copy",
      criticality: "minor",
      evidence_requirements: ["screenshot"],
      human_visible_text: "Empty state copy clearly explains the next step."
    },
    idempotency_key: "mturk-empty-state",
    risk_tier: "low",
    route: "/staging/empty-state",
    summary: "Copy clarity on empty state"
  },
  {
    artifact: {
      artifact_id: "artifact-price-mismatch",
      artifact_type: "screenshot",
      content_hash: "hash-price-mismatch",
      provenance: "staging-playwright"
    },
    criterion: {
      criterion_id: "price-consistency",
      criticality: "critical",
      evidence_requirements: ["screenshot"],
      human_visible_text:
        "Displayed staged pricing matches the acceptance criteria text."
    },
    idempotency_key: "mturk-price-consistency",
    risk_tier: "medium",
    route: "/staging/price-consistency",
    summary: "Visible data mismatch in staged pricing UI"
  },
  {
    artifact: {
      artifact_id: "artifact-mobile-nav",
      artifact_type: "screenshot",
      content_hash: "hash-mobile-nav",
      provenance: "staging-playwright"
    },
    criterion: {
      criterion_id: "mobile-nav-expanded",
      criticality: "major",
      evidence_requirements: ["screenshot"],
      human_visible_text:
        "Mobile navigation expands without clipping the final item."
    },
    idempotency_key: "mturk-mobile-nav",
    risk_tier: "medium",
    route: "/staging/mobile-nav",
    summary: "Potential clipping in mobile navigation"
  }
];

async function main() {
  const baseUrl = process.env.BROKER_BASE_URL ?? "http://127.0.0.1:3000";
  const agentRunId = process.env.AGENT_RUN_ID ?? "mturk-staging-agent-run";
  const idempotencySuffix = process.env.MTURK_STAGING_IDEMPOTENCY_SUFFIX;
  const created: Array<{
    job_id: string;
    review_task_id: string;
    provider_task_id?: string;
    summary: string;
  }> = [];

  for (const testCase of cases) {
    const idempotencyKey = idempotencySuffix
      ? `${testCase.idempotency_key}-${idempotencySuffix}`
      : testCase.idempotency_key;
    const createResponse = await postJson(`${baseUrl}/verification-jobs`, {
      acceptance_criteria: [testCase.criterion],
      agent_run_id: agentRunId,
      budget_policy: {
        maxAssignments: 1,
        maxJobCost: 5,
        maxRetries: 1
      },
      deadline_at: "2026-06-30T00:00:00.000Z",
      idempotency_key: idempotencyKey,
      risk_tier: testCase.risk_tier,
      source: {
        commit: "mturk-staging",
        environment: "staging",
        repository: "vouch",
        route: testCase.route
      }
    });
    const createPayload = (await createResponse.json()) as { job_id: string };

    await postJson(
      `${baseUrl}/verification-jobs/${createPayload.job_id}/artifacts`,
      {
        artifact_quality: "sufficient",
        environment: {
          commit: "mturk-staging",
          environment: "staging",
          repository: "vouch",
          route: testCase.route
        },
        job_id: createPayload.job_id,
        manifest_id: `${testCase.idempotency_key}-manifest`,
        raw_artifacts: [testCase.artifact]
      }
    );

    await postJson(
      `${baseUrl}/verification-jobs/${createPayload.job_id}/privacy-classification`,
      {
        allowed_reviewer_routes: ["managed"],
        artifact_manifest_id: `${testCase.idempotency_key}-manifest`,
        audit_record_id: `${testCase.idempotency_key}-audit`,
        classification_id: `${testCase.idempotency_key}-classification`,
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
        criterion_ids: [testCase.criterion.criterion_id],
        deadline_at: "2026-06-30T00:00:00.000Z",
        provider_adapter: "real-provider",
        quality_policy: "provider-managed",
        reviewer_pool: "managed",
        sanitized_package_id: `${testCase.idempotency_key}-package`,
        task_template: testCase.summary
      }
    );
    const taskPayload = (await taskResponse.json()) as {
      provider_task_id?: string;
      review_task_id: string;
    };
    created.push({
      job_id: createPayload.job_id,
      provider_task_id: taskPayload.provider_task_id,
      review_task_id: taskPayload.review_task_id,
      summary: testCase.summary
    });
  }

  console.log(JSON.stringify(created, null, 2));
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

void main();
