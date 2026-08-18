import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { FastifyInstance } from "fastify";

const FIXTURES_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "../fixtures/provider-return-path"
);

export type ProviderProofBundleManifest = {
  bundle_id: string;
  bundle_version: string;
  source: {
    proof_doc: string;
    captured_at: string;
    description: string;
  };
  reference_correlation_ids: Record<string, string>;
  files: {
    job_setup: string;
    callback: string;
    bridge_state: string;
    expected: string;
    adjudication_flow?: string;
  };
};

export type ProviderProofJobSetup = {
  verification_job: Record<string, unknown>;
  artifacts: Record<string, unknown>;
  privacy_classification: Record<string, unknown>;
  human_review_task: Record<string, unknown>;
};

export type ProviderProofCallbackTemplate = {
  provider_id: string;
  provider_response_id: string;
  reviewer_pseudonymous_id: string;
  overall_verdict: string;
  criterion_results: Array<{
    criterion_id: string;
    status: string;
    confidence: string;
  }>;
  defect_category: string;
  evidence_note: string;
  severity: string;
};

export type ProviderProofBridgeState = Record<string, unknown>;

export type ProviderProofAdjudicationFlow = {
  consensus: Record<string, unknown>;
  adjudication: Record<string, unknown>;
};

export type ProviderProofExpected = {
  callback: {
    status_code: number;
    auto_advanced: boolean;
    deduplicated?: boolean;
  };
  feedback_before_adjudication?: {
    status_code: number;
  };
  feedback: Record<string, unknown>;
  verdict?: Record<string, unknown>;
  ledger?: {
    contains_event_types?: string[];
    contains_states: string[];
    min_event_count: number;
  };
};

export type ProviderProofBundle = {
  manifest: ProviderProofBundleManifest;
  jobSetup: ProviderProofJobSetup;
  callbackTemplate: ProviderProofCallbackTemplate;
  bridgeState: ProviderProofBridgeState;
  expected: ProviderProofExpected;
  adjudicationFlow: ProviderProofAdjudicationFlow | null;
};

export type ProviderProofReplayResult = {
  bundleId: string;
  jobId: string;
  reviewTaskId: string;
  providerTaskId: string;
  callbackStatusCode: number;
  callbackBody: Record<string, unknown>;
  feedbackBody: Record<string, unknown>;
  verdictBody: Record<string, unknown> | null;
  inspectionBody: Record<string, unknown> | null;
};

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function listProviderProofBundles(): string[] {
  return readdirSync(FIXTURES_ROOT).filter((entry) => {
    const bundleDir = join(FIXTURES_ROOT, entry);
    return (
      statSync(bundleDir).isDirectory() &&
      statSync(join(bundleDir, "manifest.json")).isFile()
    );
  });
}

export function loadProviderProofBundle(bundleId: string): ProviderProofBundle {
  const bundleDir = join(FIXTURES_ROOT, bundleId);
  const manifest = readJson<ProviderProofBundleManifest>(
    join(bundleDir, "manifest.json")
  );

  if (manifest.bundle_id !== bundleId) {
    throw new Error(
      `Bundle id mismatch: directory ${bundleId} vs manifest ${manifest.bundle_id}`
    );
  }

  const adjudicationFlowFile = manifest.files.adjudication_flow;
  return {
    manifest,
    jobSetup: readJson<ProviderProofJobSetup>(
      join(bundleDir, manifest.files.job_setup)
    ),
    callbackTemplate: readJson<ProviderProofCallbackTemplate>(
      join(bundleDir, manifest.files.callback)
    ),
    bridgeState: readJson<ProviderProofBridgeState>(
      join(bundleDir, manifest.files.bridge_state)
    ),
    expected: readJson<ProviderProofExpected>(
      join(bundleDir, manifest.files.expected)
    ),
    adjudicationFlow: adjudicationFlowFile
      ? readJson<ProviderProofAdjudicationFlow>(
          join(bundleDir, adjudicationFlowFile)
        )
      : null
  };
}

export async function seedJobFromProofBundle(
  app: FastifyInstance,
  bundle: ProviderProofBundle
): Promise<{ jobId: string; reviewTaskId: string; providerTaskId: string }> {
  const {
    verification_job: verificationJob,
    artifacts,
    privacy_classification: privacy,
    human_review_task: task
  } = bundle.jobSetup;
  const headers = app.services.runtimeConfig.operatorToken
    ? { "x-operator-token": app.services.runtimeConfig.operatorToken }
    : undefined;

  const createResponse = await app.inject({
    headers,
    method: "POST",
    url: "/verification-jobs",
    payload: {
      ...verificationJob,
      idempotency_key: `proof-bundle-${bundle.manifest.bundle_id}-${crypto.randomUUID()}`
    }
  });
  if (createResponse.statusCode >= 400) {
    throw new Error(`verification-jobs create failed: ${createResponse.body}`);
  }
  const jobId = createResponse.json<{ job_id: string }>().job_id;

  const artifactResponse = await app.inject({
    headers,
    method: "POST",
    url: `/verification-jobs/${jobId}/artifacts`,
    payload: {
      ...artifacts,
      job_id: jobId,
      environment: (verificationJob.source as Record<string, string>) ?? {
        repository: "repo",
        commit: "proof-bundle",
        environment: "test",
        route: "/proof-bundle"
      }
    }
  });
  if (artifactResponse.statusCode >= 400) {
    throw new Error(`artifacts failed: ${artifactResponse.body}`);
  }

  const privacyResponse = await app.inject({
    headers,
    method: "POST",
    url: `/verification-jobs/${jobId}/privacy-classification`,
    payload: {
      ...privacy,
      job_id: jobId,
      artifact_manifest_id: artifacts.manifest_id
    }
  });
  if (privacyResponse.statusCode >= 400) {
    throw new Error(`privacy-classification failed: ${privacyResponse.body}`);
  }

  const taskResponse = await app.inject({
    headers,
    method: "POST",
    url: `/verification-jobs/${jobId}/human-review-tasks`,
    payload: task
  });
  if (taskResponse.statusCode >= 400) {
    throw new Error(`human-review-tasks failed: ${taskResponse.body}`);
  }

  const taskPayload = taskResponse.json<{
    provider_task_id: string;
    review_task_id: string;
  }>();
  if (!taskPayload.provider_task_id) {
    throw new Error(
      "human-review-tasks did not return provider_task_id (is mock dispatch enabled?)"
    );
  }

  return {
    jobId,
    providerTaskId: taskPayload.provider_task_id,
    reviewTaskId: taskPayload.review_task_id
  };
}

export async function replayProviderProofBundle(
  app: FastifyInstance,
  bundle: ProviderProofBundle,
  options: { operatorToken?: string; sharedSecret?: string } = {}
): Promise<ProviderProofReplayResult> {
  const seeded = await seedJobFromProofBundle(app, bundle);
  const headers = app.services.runtimeConfig.operatorToken
    ? { "x-operator-token": app.services.runtimeConfig.operatorToken }
    : undefined;

  const callbackResponse = await app.inject({
    method: "POST",
    url: "/provider-callback",
    payload: {
      ...bundle.callbackTemplate,
      provider_task_id: seeded.providerTaskId,
      shared_secret: options.sharedSecret ?? "top-secret"
    }
  });

  if (bundle.expected.feedback_before_adjudication) {
    const pendingFeedbackResponse = await app.inject({
      headers,
      method: "GET",
      url: `/verification-jobs/${seeded.jobId}/feedback`
    });
    if (
      pendingFeedbackResponse.statusCode !==
      bundle.expected.feedback_before_adjudication.status_code
    ) {
      throw new Error(
        `feedback before adjudication status ${pendingFeedbackResponse.statusCode} !== ${bundle.expected.feedback_before_adjudication.status_code}`
      );
    }
  }

  if (bundle.adjudicationFlow) {
    const consensusResponse = await app.inject({
      headers,
      method: "POST",
      url: `/verification-jobs/${seeded.jobId}/consensus`,
      payload: {
        ...bundle.adjudicationFlow.consensus,
        review_task_id: seeded.reviewTaskId
      }
    });
    if (consensusResponse.statusCode >= 400) {
      throw new Error(`consensus failed: ${consensusResponse.body}`);
    }

    const adjudicationResponse = await app.inject({
      headers,
      method: "POST",
      url: `/verification-jobs/${seeded.jobId}/adjudications`,
      payload: bundle.adjudicationFlow.adjudication
    });
    if (adjudicationResponse.statusCode >= 400) {
      throw new Error(`adjudication failed: ${adjudicationResponse.body}`);
    }
  }

  const feedbackResponse = await app.inject({
    headers,
    method: "GET",
    url: `/verification-jobs/${seeded.jobId}/feedback`
  });

  const verdictResponse = await app.inject({
    headers,
    method: "GET",
    url: `/verification-jobs/${seeded.jobId}/verdict`
  });

  let inspectionBody: Record<string, unknown> | null = null;
  if (options.operatorToken) {
    const inspectionResponse = await app.inject({
      method: "GET",
      url: `/runtime/inspection/jobs/${seeded.jobId}`,
      headers: {
        "x-operator-token": options.operatorToken
      }
    });
    if (inspectionResponse.statusCode < 400) {
      inspectionBody = inspectionResponse.json();
    }
  }

  return {
    bundleId: bundle.manifest.bundle_id,
    callbackBody: callbackResponse.json(),
    callbackStatusCode: callbackResponse.statusCode,
    feedbackBody: feedbackResponse.json(),
    inspectionBody,
    jobId: seeded.jobId,
    providerTaskId: seeded.providerTaskId,
    reviewTaskId: seeded.reviewTaskId,
    verdictBody:
      verdictResponse.statusCode < 400 ? verdictResponse.json() : null
  };
}

export function assertProviderProofReplay(
  bundle: ProviderProofBundle,
  result: ProviderProofReplayResult
): void {
  const { expected } = bundle;

  if (result.callbackStatusCode !== expected.callback.status_code) {
    throw new Error(
      `callback status ${result.callbackStatusCode} !== ${expected.callback.status_code}: ${JSON.stringify(result.callbackBody)}`
    );
  }

  for (const [key, value] of Object.entries(expected.callback)) {
    if (key === "status_code") {
      continue;
    }
    if (result.callbackBody[key] !== value) {
      throw new Error(
        `callback.${key}: expected ${String(value)}, got ${String(result.callbackBody[key])}`
      );
    }
  }

  for (const [key, value] of Object.entries(expected.feedback)) {
    const actual = result.feedbackBody[key];
    if (Array.isArray(value)) {
      if (
        !Array.isArray(actual) ||
        JSON.stringify(actual) !== JSON.stringify(value)
      ) {
        throw new Error(
          `feedback.${key}: expected ${JSON.stringify(value)}, got ${JSON.stringify(actual)}`
        );
      }
      continue;
    }
    if (actual !== value) {
      throw new Error(
        `feedback.${key}: expected ${String(value)}, got ${String(actual)}`
      );
    }
  }

  if (expected.verdict && result.verdictBody) {
    for (const [key, value] of Object.entries(expected.verdict)) {
      if (result.verdictBody[key] !== value) {
        throw new Error(
          `verdict.${key}: expected ${String(value)}, got ${String(result.verdictBody[key])}`
        );
      }
    }
  }

  if (expected.ledger && result.inspectionBody) {
    const ledgerValue = result.inspectionBody.ledger;
    const ledger = Array.isArray(ledgerValue)
      ? (ledgerValue as Array<{ eventType?: string }>)
      : undefined;
    if (!ledger || ledger.length < expected.ledger.min_event_count) {
      throw new Error(
        `ledger event count ${ledger?.length ?? 0} < min ${expected.ledger.min_event_count}`
      );
    }
    const eventTypes = new Set(
      ledger.map((event) => event.eventType).filter(Boolean)
    );
    for (const eventType of expected.ledger.contains_event_types ?? []) {
      if (!eventTypes.has(eventType)) {
        throw new Error(
          `ledger missing event type ${eventType}; have ${[...eventTypes].join(", ")}`
        );
      }
    }
    const transitionTargets = new Set(
      ledger
        .map((event) => {
          const match = event.eventType?.match(/\.to\.([^.]+)$/);
          return match?.[1];
        })
        .filter((state): state is string => Boolean(state))
    );
    for (const state of expected.ledger.contains_states) {
      if (!transitionTargets.has(state)) {
        throw new Error(
          `ledger missing transition to ${state}; have ${[...transitionTargets].join(", ")}`
        );
      }
    }
  }
}
