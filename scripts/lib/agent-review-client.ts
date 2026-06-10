// One-call human review for agentic loops: commissions a verification job
// through the existing control-plane endpoints and polls feedback until the
// broker returns an agent_next_action. See
// docs/architecture/agent-loop-integration.md.

import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { extname } from "node:path";

import {
  buildStructuredTaskTemplate,
  estimateTemplateCost,
  MAX_VISUAL_DATA_URL_CHARS,
  recommendedPricing,
  type RiskTier,
  type StructuredTaskTemplate,
  type TemplatePricing
} from "./review-templates.js";

export type ReviewCriterion = {
  criterionId: string;
  criticality?: "critical" | "major" | "minor" | "audit";
  humanVisibleText: string;
};

export type ReviewScreenshot = {
  caption?: string;
  path: string;
  viewport?: string;
};

export type AgentFeedback = {
  agent_next_action: "pass" | "fail" | "retry" | "recapture" | "escalate";
  defect_category?: string | null;
  evidence_pointers: string[];
  failed_criteria: string[];
  final_verdict: string;
  human_annotations: string[];
  policy_constraints: string[];
  provider_ids: string[];
  provider_response_ids: string[];
  repair_hint?: string | null;
  retry_allowed: boolean;
  retry_reason?: string | null;
  severity?: string | null;
};

export type RequestHumanReviewOptions = {
  agentRunId?: string;
  brokerBaseUrl: string;
  budget?: { maxAssignments: number; maxJobCost: number; maxRetries: number };
  criteria: ReviewCriterion[];
  dataClass?: string;
  deadlineAt?: string;
  fetchImpl?: typeof fetch;
  idempotencyKey?: string;
  pollIntervalMs?: number;
  pricing?: TemplatePricing;
  providerAdapter?: string;
  reviewerPool?: string;
  riskTier?: RiskTier;
  screenshot?: ReviewScreenshot;
  source?: {
    commit?: string;
    environment?: string;
    repository?: string;
    route?: string;
  };
  template: StructuredTaskTemplate | string;
  timeoutMs?: number;
  waitForFeedback?: boolean;
};

export type HumanReviewRequestResult = {
  estimatedCostUsd?: number;
  feedback?: AgentFeedback;
  jobId: string;
  providerTaskId?: string;
  reviewTaskId: string;
  timedOut: boolean;
};

const MIME_BY_EXTENSION: Record<string, string> = {
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp"
};

export function screenshotToVisualEvidence(screenshot: ReviewScreenshot): {
  artifact_id: string;
  caption: string;
  content_hash: string;
  data_url: string;
  viewport: string;
} {
  const mime = MIME_BY_EXTENSION[extname(screenshot.path).toLowerCase()];
  if (!mime) {
    throw new Error(
      `Unsupported screenshot extension for ${screenshot.path}; expected one of ${Object.keys(MIME_BY_EXTENSION).join(", ")}`
    );
  }
  const bytes = readFileSync(screenshot.path);
  // MTurk caps QuestionXML at 131,072 chars and the inline data URL dominates
  // it; base64 inflates bytes by 4/3, so fail fast with actionable guidance.
  const dataUrlChars = Math.ceil((bytes.length * 4) / 3) + 30;
  if (dataUrlChars > MAX_VISUAL_DATA_URL_CHARS) {
    throw new Error(
      `Screenshot ${screenshot.path} is ${bytes.length} bytes (~${dataUrlChars} chars as a data URL), over the ${MAX_VISUAL_DATA_URL_CHARS}-char MTurk QuestionXML budget; re-encode as JPEG under ~80KB`
    );
  }
  const contentHash = createHash("sha256").update(bytes).digest("hex");
  return {
    artifact_id: `artifact-${contentHash.slice(0, 16)}`,
    caption: screenshot.caption ?? "Screenshot under review",
    content_hash: contentHash,
    data_url: `data:${mime};base64,${bytes.toString("base64")}`,
    viewport: screenshot.viewport ?? "unspecified"
  };
}

export async function requestHumanReview(
  options: RequestHumanReviewOptions
): Promise<HumanReviewRequestResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.brokerBaseUrl.replace(/\/$/, "");
  const riskTier = options.riskTier ?? "medium";
  const idempotencyKey =
    options.idempotencyKey ?? `agent-review-${randomUUID()}`;
  const deadlineAt =
    options.deadlineAt ?? new Date(Date.now() + 24 * 3600_000).toISOString();

  let taskTemplate: string;
  let pricing: TemplatePricing | undefined;
  let estimatedCostUsd: number | undefined;
  if (typeof options.template === "string") {
    taskTemplate = options.template;
  } else {
    pricing =
      options.template.pricing ??
      options.pricing ??
      recommendedPricing(options.template.template_id, riskTier);
    estimatedCostUsd = estimateTemplateCost(pricing);
    taskTemplate = buildStructuredTaskTemplate({
      ...options.template,
      pricing
    });
  }

  const budget = options.budget ?? {
    maxAssignments: pricing?.max_assignments ?? 1,
    maxJobCost: estimatedCostUsd
      ? Math.max(1, Math.ceil(estimatedCostUsd * 2))
      : 5,
    maxRetries: 1
  };
  const source = {
    commit: options.source?.commit ?? "unknown",
    environment: options.source?.environment ?? "agent-loop",
    feature_flags: [],
    repository: options.source?.repository ?? "agent-review",
    route: options.source?.route ?? "/"
  };

  const visualEvidence = options.screenshot
    ? screenshotToVisualEvidence(options.screenshot)
    : undefined;
  // Text-only reviews carry their content in the task template envelope; the
  // artifact entry exists so the evidence ledger has a hash to anchor.
  const contentHash =
    visualEvidence?.content_hash ??
    createHash("sha256").update(taskTemplate).digest("hex");
  const artifactId =
    visualEvidence?.artifact_id ?? `artifact-${contentHash.slice(0, 16)}`;

  const createPayload = await postJson(
    fetchImpl,
    `${baseUrl}/verification-jobs`,
    {
      acceptance_criteria: options.criteria.map((criterion) => ({
        criterion_id: criterion.criterionId,
        criticality: criterion.criticality ?? "major",
        evidence_requirements: [visualEvidence ? "screenshot" : "text"],
        human_visible_text: criterion.humanVisibleText
      })),
      agent_run_id: options.agentRunId ?? `agent-review-${randomUUID()}`,
      budget_policy: budget,
      deadline_at: deadlineAt,
      idempotency_key: idempotencyKey,
      risk_tier: riskTier,
      source
    }
  );
  const jobId = (createPayload as { job_id: string }).job_id;

  await postJson(fetchImpl, `${baseUrl}/verification-jobs/${jobId}/artifacts`, {
    artifact_quality: "sufficient",
    environment: source,
    job_id: jobId,
    manifest_id: `${idempotencyKey}-manifest`,
    raw_artifacts: [
      {
        artifact_id: artifactId,
        artifact_type: visualEvidence ? "screenshot" : "trace_summary",
        content_hash: contentHash,
        provenance: options.screenshot?.path ?? "agent-task-template"
      }
    ],
    sanitized_packages: [
      {
        externalization_decision: "allowed",
        package_hash: contentHash,
        package_id: `${idempotencyKey}-package`,
        redaction_policy_version: "agent-review-v1",
        transform_hash: contentHash
      }
    ]
  });

  await postJson(
    fetchImpl,
    `${baseUrl}/verification-jobs/${jobId}/privacy-classification`,
    {
      allowed_reviewer_routes: [options.reviewerPool ?? "managed"],
      artifact_manifest_id: `${idempotencyKey}-manifest`,
      audit_record_id: `${idempotencyKey}-audit`,
      classification_id: `${idempotencyKey}-classification`,
      data_class: options.dataClass ?? "internal_low",
      externalization_decision: "allowed",
      job_id: jobId,
      policy_version: "v1",
      redaction_status: "completed"
    }
  );

  const taskPayload = (await postJson(
    fetchImpl,
    `${baseUrl}/verification-jobs/${jobId}/human-review-tasks`,
    {
      criterion_ids: options.criteria.map((criterion) => criterion.criterionId),
      deadline_at: deadlineAt,
      provider_adapter: options.providerAdapter ?? "real-provider",
      quality_policy: "provider-managed",
      reviewer_pool: options.reviewerPool ?? "managed",
      sanitized_package_id: `${idempotencyKey}-package`,
      task_template: taskTemplate,
      visual_evidence: visualEvidence
    }
  )) as { provider_task_id?: string; review_task_id: string };

  const base: HumanReviewRequestResult = {
    estimatedCostUsd,
    jobId,
    providerTaskId: taskPayload.provider_task_id,
    reviewTaskId: taskPayload.review_task_id,
    timedOut: false
  };

  if (options.waitForFeedback === false) {
    return base;
  }

  const wait = await waitForFeedback({
    brokerBaseUrl: baseUrl,
    fetchImpl,
    jobId,
    pollIntervalMs: options.pollIntervalMs,
    timeoutMs: options.timeoutMs
  });
  return { ...base, feedback: wait.feedback, timedOut: wait.timedOut };
}

export async function waitForFeedback(options: {
  brokerBaseUrl: string;
  fetchImpl?: typeof fetch;
  jobId: string;
  pollIntervalMs?: number;
  timeoutMs?: number;
}): Promise<{ feedback?: AgentFeedback; timedOut: boolean }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.brokerBaseUrl.replace(/\/$/, "");
  const deadline = Date.now() + (options.timeoutMs ?? 30 * 60_000);
  let interval = options.pollIntervalMs ?? 15_000;

  for (;;) {
    const response = await fetchImpl(
      `${baseUrl}/verification-jobs/${options.jobId}/feedback`
    );
    if (response.ok) {
      const feedback = (await response.json()) as AgentFeedback;
      if (feedback.agent_next_action) {
        return { feedback, timedOut: false };
      }
    } else if (response.status !== 404) {
      throw new Error(
        `Feedback poll failed: ${response.status} ${await response.text()}`
      );
    }

    if (Date.now() + interval > deadline) {
      return { timedOut: true };
    }
    await new Promise((resolveSleep) => setTimeout(resolveSleep, interval));
    interval = Math.min(Math.round(interval * 1.5), 60_000);
  }
}

async function postJson(
  fetchImpl: typeof fetch,
  url: string,
  payload: unknown
) {
  const response = await fetchImpl(url, {
    body: JSON.stringify(payload),
    headers: { "content-type": "application/json" },
    method: "POST"
  });
  if (!response.ok) {
    throw new Error(
      `${url} failed: ${response.status} ${await response.text()}`
    );
  }
  return response.json();
}
