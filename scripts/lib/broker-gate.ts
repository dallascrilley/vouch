import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { buildApp } from "../../src/api/app.js";
import { loadRuntimeConfig } from "../../src/config/runtime.js";

/**
 * A thin client over the broker's verification lifecycle, plus a single
 * `runSelfVerificationGate` driver that turns a set of pass/fail checks into a
 * durable broker verdict. Two transports share one code path:
 *
 *  - InProcess: builds the app in-memory (SQLite) — zero infra, used by
 *    `npm run verify` locally and in CI. Honors RUNTIME_SQLITE_PATH for a
 *    durable ledger; otherwise runs against an ephemeral temp database.
 *  - Http: talks to a deployed broker via BROKER_URL — the same gate, but the
 *    verdict ledger lives in the shared service.
 */

export type Confidence = "low" | "medium" | "high";
export type CriterionStatus =
  | "pending"
  | "pass"
  | "fail"
  | "unclear"
  | "not_visible";
export type Criticality = "critical" | "major" | "minor" | "audit";
export type RecommendedAction =
  | "pass"
  | "fail"
  | "retry"
  | "recapture"
  | "human_review"
  | "internal_review"
  | "fail_closed";

export type GateSource = {
  repository: string;
  branch?: string;
  commit: string;
  environment: string;
  route: string;
};

export type GateCriterion = {
  criterionId: string;
  criticality: Criticality;
  humanVisibleText: string;
  evidenceRequirements: string[];
};

export type GateCheckResult = {
  criterionId: string;
  status: CriterionStatus;
  confidence: Confidence;
  /** Stable hash of the check's output; recorded as evidence provenance. */
  evidenceHash: string;
  /** Short failure-category tags surfaced in machine-readable feedback. */
  failureCategories?: string[];
};

export type Verdict = {
  verdict_id: string;
  job_id: string;
  final_verdict: string;
  confidence: string;
  release_gate_effect: "allow" | "block";
  retry_recommendation: string | null;
};

export type Feedback = {
  feedback_id: string;
  job_id: string;
  final_verdict: string;
  failed_criteria: string[];
  machine_check_failures: string[];
  retry_allowed: boolean;
  retry_reason: string | null;
  repair_hint: string | null;
};

export type ReleaseArtifact = {
  job_id: string;
  final_verdict: string;
  release_gate_effect: string;
  ledger_attestation_hash: string;
  signed_at: string;
  signature: string;
};

type Response = { status: number; body: unknown };

interface Transport {
  post(path: string, payload: unknown): Promise<Response>;
  get(path: string): Promise<Response>;
  close(): Promise<void>;
}

class HttpTransport implements Transport {
  constructor(
    private readonly baseUrl: string,
    private readonly operatorToken?: string
  ) {}

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      "content-type": "application/json"
    };
    if (this.operatorToken) {
      headers["x-operator-token"] = this.operatorToken;
    }
    return headers;
  }

  async post(path: string, payload: unknown): Promise<Response> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(payload)
    });
    return { status: res.status, body: await this.parse(res) };
  }

  async get(path: string): Promise<Response> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: this.headers()
    });
    return { status: res.status, body: await this.parse(res) };
  }

  private async parse(res: globalThis.Response): Promise<unknown> {
    const text = await res.text();
    return text ? (JSON.parse(text) as unknown) : null;
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}

class InProcessTransport implements Transport {
  private constructor(
    private readonly app: ReturnType<typeof buildApp>,
    private readonly cleanup: () => void
  ) {}

  static async create(): Promise<InProcessTransport> {
    let cleanup = (): void => {};
    const env = { ...process.env };
    // Local runs sign release artifacts with a well-known dev key; set
    // RELEASE_GATE_SIGNING_KEY for any artifact that leaves the machine.
    env.RELEASE_GATE_SIGNING_KEY ??= "local-dev-release-gate-key";
    if (!env.RUNTIME_SQLITE_PATH) {
      const runtimeRoot = mkdtempSync(join(tmpdir(), "broker-gate-"));
      env.RUNTIME_SQLITE_PATH = join(runtimeRoot, "runtime.sqlite");
      env.RUNTIME_ARTIFACT_ROOT = join(runtimeRoot, "artifacts");
      env.PROVIDER_SQLITE_PATH = join(runtimeRoot, "provider-state.sqlite");
      cleanup = (): void =>
        rmSync(runtimeRoot, { force: true, recursive: true });
    }
    const app = buildApp(loadRuntimeConfig(env));
    await app.ready();
    return new InProcessTransport(app, cleanup);
  }

  async post(path: string, payload: unknown): Promise<Response> {
    const res = await this.app.inject({
      method: "POST",
      url: path,
      payload: payload as object
    });
    return { status: res.statusCode, body: res.body ? res.json() : null };
  }

  async get(path: string): Promise<Response> {
    const res = await this.app.inject({ method: "GET", url: path });
    return { status: res.statusCode, body: res.body ? res.json() : null };
  }

  async close(): Promise<void> {
    await this.app.close();
    this.cleanup();
  }
}

export class BrokerClient {
  private constructor(private readonly transport: Transport) {}

  /** In-process by default; HTTP when BROKER_URL is set. */
  static async connect(
    env: NodeJS.ProcessEnv = process.env
  ): Promise<BrokerClient> {
    if (env.BROKER_URL) {
      return new BrokerClient(
        new HttpTransport(
          env.BROKER_URL.replace(/\/$/, ""),
          env.RUNTIME_OPERATOR_TOKEN
        )
      );
    }
    return new BrokerClient(await InProcessTransport.create());
  }

  close(): Promise<void> {
    return this.transport.close();
  }

  private expect(res: Response, allowed: number[], context: string): void {
    if (!allowed.includes(res.status)) {
      const detail =
        res.body && typeof res.body === "object" && "message" in res.body
          ? String(res.body.message)
          : JSON.stringify(res.body);
      throw new Error(`${context} failed (${res.status}): ${detail}`);
    }
  }

  /**
   * Drive the full AI-only lifecycle (create → artifacts → privacy →
   * self-verification) and return the durable verdict + machine-readable
   * feedback. `results` are the pass/fail outcomes of each declared criterion.
   */
  async runSelfVerificationGate(input: {
    runId: string;
    source: GateSource;
    criteria: GateCriterion[];
    results: GateCheckResult[];
    deadlineMs?: number;
    /** Where to persist the signed release artifact; null disables the write. */
    releaseArtifactPath?: string | null;
  }): Promise<{
    jobId: string;
    verdict: Verdict;
    feedback: Feedback | null;
    releaseArtifact: ReleaseArtifact | null;
  }> {
    const { runId, source, criteria, results } = input;
    const manifestId = `manifest-${runId}`;
    const deadlineAt = new Date(
      Date.now() + (input.deadlineMs ?? 3_600_000)
    ).toISOString();

    const created = await this.transport.post("/verification-jobs", {
      acceptance_criteria: criteria.map((criterion) => ({
        criterion_id: criterion.criterionId,
        criticality: criterion.criticality,
        evidence_requirements: criterion.evidenceRequirements,
        human_visible_text: criterion.humanVisibleText
      })),
      budget_policy: { maxAssignments: 1, maxJobCost: 5, maxRetries: 1 },
      deadline_at: deadlineAt,
      idempotency_key: `verify-${runId}`,
      risk_tier: "low",
      source: {
        repository: source.repository,
        branch: source.branch,
        commit: source.commit,
        environment: source.environment,
        route: source.route
      }
    });
    this.expect(created, [202], "create job");
    const jobId = (created.body as { job_id: string }).job_id;

    const attached = await this.transport.post(
      `/verification-jobs/${jobId}/artifacts`,
      {
        manifest_id: manifestId,
        job_id: jobId,
        artifact_quality: "sufficient",
        raw_artifacts: results.map((result) => ({
          artifact_id: `evidence-${result.criterionId}`,
          artifact_type: "console_summary",
          content_hash: result.evidenceHash,
          provenance: `check:${result.criterionId}`
        })),
        environment: {
          repository: source.repository,
          branch: source.branch,
          commit: source.commit,
          environment: source.environment,
          route: source.route
        }
      }
    );
    this.expect(attached, [202], "attach artifacts");

    const classified = await this.transport.post(
      `/verification-jobs/${jobId}/privacy-classification`,
      {
        classification_id: `privacy-${runId}`,
        job_id: jobId,
        artifact_manifest_id: manifestId,
        data_class: "internal_low",
        redaction_status: "not_required",
        externalization_decision: "internal_only",
        policy_version: "v1",
        audit_record_id: `audit-${runId}`
      }
    );
    this.expect(classified, [202], "privacy classification");

    // Definite machine failures stay machine-resolved (fail). Checks the
    // machine cannot resolve (unclear/not_visible/pending) escalate to a real
    // human review package instead of a fake retry.
    const allPass = results.every((result) => result.status === "pass");
    const anyUnresolved = results.some(
      (result) =>
        result.status === "unclear" ||
        result.status === "not_visible" ||
        result.status === "pending"
    );
    const recommendedAction: RecommendedAction = allPass
      ? "pass"
      : anyUnresolved
        ? "human_review"
        : "fail";
    const failureCategories = results.flatMap(
      (result) => result.failureCategories ?? []
    );

    const verified = await this.transport.post(
      `/verification-jobs/${jobId}/self-verification-results`,
      {
        result_id: `result-${runId}`,
        job_id: jobId,
        confidence: "high",
        recommended_action: recommendedAction,
        criterion_results: results.map((result) => ({
          criterion_id: result.criterionId,
          status: result.status,
          confidence: result.confidence
        })),
        failure_categories: failureCategories
      }
    );
    this.expect(verified, [202], "self-verification");

    // Escalated jobs have no verdict until the human callback lands. Block up
    // to VERIFY_HITL_TIMEOUT_MS (the simulated provider resolves synchronously,
    // so local runs never wait), then surface stuck-state instead of hanging.
    const hitlTimeoutMs = Number(process.env.VERIFY_HITL_TIMEOUT_MS ?? 0);
    const pollDeadline = Date.now() + (Number.isFinite(hitlTimeoutMs) ? hitlTimeoutMs : 0);
    let verdictRes = await this.transport.get(
      `/verification-jobs/${jobId}/verdict`
    );
    while (verdictRes.status === 404 && Date.now() < pollDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      verdictRes = await this.transport.get(`/verification-jobs/${jobId}/verdict`);
    }
    if (verdictRes.status === 404) {
      const stuck = await this.transport.get(
        `/verification-jobs/${jobId}/stuck-state`
      );
      throw new Error(
        `verification job ${jobId} is blocked on human review (${JSON.stringify(stuck.body)}). ` +
          "Set VERIFY_HITL_TIMEOUT_MS to wait for the provider callback, or resolve via the stuck-state API."
      );
    }
    this.expect(verdictRes, [200], "read verdict");
    const verdict = verdictRes.body as Verdict;

    const feedbackRes = await this.transport.get(
      `/verification-jobs/${jobId}/feedback`
    );
    const feedback =
      feedbackRes.status === 200 ? (feedbackRes.body as Feedback) : null;

    // Persist the signed release artifact so downstream policy checks (CI,
    // release tooling) can verify the verdict without broker access.
    const artifactRes = await this.transport.get(
      `/verification-jobs/${jobId}/release-artifact`
    );
    const releaseArtifact =
      artifactRes.status === 200 ? (artifactRes.body as ReleaseArtifact) : null;
    const artifactPath =
      input.releaseArtifactPath === undefined
        ? ".runtime/verify-verdict.json"
        : input.releaseArtifactPath;
    if (releaseArtifact && artifactPath) {
      mkdirSync(dirname(artifactPath), { recursive: true });
      writeFileSync(artifactPath, `${JSON.stringify(releaseArtifact, null, 2)}\n`);
    }

    return { jobId, verdict, feedback, releaseArtifact };
  }
}
