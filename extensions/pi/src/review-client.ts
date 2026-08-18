import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  openSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { dirname, join } from "node:path";

import {
  BrokerHttpError,
  requestHumanReview,
  waitForFeedback,
  type AgentFeedback,
  type HumanReviewRequestResult,
  type RequestHumanReviewOptions,
  type ReviewCriterion
} from "../../../scripts/lib/agent-review-client.js";
import type { ReviewDataClass } from "./classify-artifact.js";

export { BrokerHttpError } from "../../../scripts/lib/agent-review-client.js";

export type ReviewStatus = "settled" | "ambient" | "not_reviewed";

export type ReviewEnvelope = {
  status: ReviewStatus;
  handle?: string;
  jobId?: string;
  reviewTaskId?: string;
  agent_next_action?: AgentFeedback["agent_next_action"];
  feedback?: AgentFeedback;
  final_verdict?: string;
  simulated: boolean;
  stuckState?: unknown;
  blockingReasons?: string[];
  contentHash?: string;
  expired?: boolean;
  stale?: boolean;
};

export type ReviewInput = {
  agentControlled?: boolean;
  agentRunId?: string;
  brokerBaseUrl?: string;
  contentHash: string;
  contentSource?: { kind: "file" | "git_diff"; path?: string };
  criteria: ReviewCriterion[];
  dataClass?: ReviewDataClass;
  deadlineAt?: string;
  forceNew?: boolean;
  operatorToken?: string;
  pollIntervalMs?: number;
  reviewerPool?: string;
  riskTier?: RequestHumanReviewOptions["riskTier"];
  screenshot?: RequestHumanReviewOptions["screenshot"];
  signal?: AbortSignal;
  simulated: boolean;
  source?: RequestHumanReviewOptions["source"];
  template?: RequestHumanReviewOptions["template"];
  templateId: string;
  timeoutMs?: number;
  workspaceRef?: string;
};

export type ReviewHandleRecord = {
  contentHash: string;
  contentSource?: { kind: "file" | "git_diff"; path?: string };
  createdAt: string;
  deadlineAt?: string;
  envelope?: ReviewEnvelope;
  handle: string;
  idempotencyKey: string;
  jobId: string;
  lastSeenAt: string;
  reviewTaskId: string;
  surfacedAt?: string;
  workspaceRef?: string;
};

function currentContentHash(record: ReviewHandleRecord): string | undefined {
  if (!record.workspaceRef || !record.contentSource) return undefined;
  try {
    const content =
      record.contentSource.kind === "file"
        ? readFileSync(record.contentSource.path ?? "")
        : execFileSync("git", ["diff", "--binary", "HEAD", "--"], {
            cwd: record.workspaceRef,
            encoding: "buffer",
            maxBuffer: 2_000_000
          });
    return createHash("sha256").update(content).digest("hex");
  } catch {
    return undefined;
  }
}

function markSettledStale(
  envelope: ReviewEnvelope,
  record: ReviewHandleRecord,
  resolver?: (record: ReviewHandleRecord) => string | undefined
): ReviewEnvelope {
  if (envelope.status !== "settled") return envelope;
  const observedHash = (resolver ?? currentContentHash)(record);
  if (observedHash === record.contentHash) return envelope;
  const reason =
    observedHash === undefined
      ? "reviewed content could not be revalidated"
      : "reviewed content changed after human review";
  return {
    ...envelope,
    agent_next_action: "retry",
    blockingReasons: [...(envelope.blockingReasons ?? []), reason],
    feedback: envelope.feedback
      ? {
          ...envelope.feedback,
          agent_next_action: "retry",
          final_verdict:
            envelope.feedback.final_verdict ??
            envelope.final_verdict ??
            "unclear",
          retry_allowed: false,
          retry_reason: reason
        }
      : undefined,
    stale: true
  };
}

type ReviewClaim = {
  claimed: boolean;
  record: ReviewHandleRecord;
};

type RegistryFile = { records: ReviewHandleRecord[] };

function decodeRegistryFile(value: unknown): RegistryFile {
  if (
    !value ||
    typeof value !== "object" ||
    !Array.isArray((value as { records?: unknown }).records)
  ) {
    throw new Error("invalid registry shape");
  }
  const records = (value as { records: unknown[] }).records;
  for (const record of records) {
    if (
      !record ||
      typeof record !== "object" ||
      [
        "contentHash",
        "createdAt",
        "handle",
        "idempotencyKey",
        "jobId",
        "lastSeenAt",
        "reviewTaskId"
      ].some(
        (field) =>
          typeof (record as Record<string, unknown>)[field] !== "string"
      )
    ) {
      throw new Error("invalid registry record");
    }
  }
  return { records: records as ReviewHandleRecord[] };
}

export class ReviewHandleRegistry {
  private readonly records = new Map<string, ReviewHandleRecord>();

  constructor(private readonly filePath?: string) {
    if (filePath) {
      mkdirSync(dirname(filePath), { recursive: true, mode: 0o700 });
      try {
        const parsed = decodeRegistryFile(
          JSON.parse(readFileSync(filePath, "utf8"))
        );
        for (const record of parsed.records ?? []) {
          this.records.set(record.idempotencyKey, record);
        }
      } catch {
        if (existsSync(filePath)) {
          throw new Error(`Review handle registry is corrupt: ${filePath}`);
        }
      }
    }
  }

  get(idempotencyKey: string): ReviewHandleRecord | undefined {
    this.reload();
    return this.records.get(idempotencyKey);
  }

  reload(): void {
    if (!this.filePath) return;
    try {
      const parsed = decodeRegistryFile(
        JSON.parse(readFileSync(this.filePath, "utf8"))
      );
      this.records.clear();
      for (const record of parsed.records ?? []) {
        this.records.set(record.idempotencyKey, record);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw new Error(`Review handle registry is corrupt: ${this.filePath}`);
      }
    }
  }

  claim(record: ReviewHandleRecord): ReviewClaim {
    let result: ReviewClaim | undefined;
    this.persistLocked(() => {
      const existing = this.records.get(record.idempotencyKey);
      if (existing && existing.jobId) {
        result = { claimed: false, record: existing };
        return;
      }
      if (existing && Date.parse(existing.lastSeenAt) + 30_000 > Date.now()) {
        result = { claimed: false, record: existing };
        return;
      }
      this.records.set(record.idempotencyKey, record);
      result = { claimed: true, record };
    });
    return result as ReviewClaim;
  }

  remove(idempotencyKey: string): void {
    this.persistLocked(() => this.records.delete(idempotencyKey));
  }

  list(): ReviewHandleRecord[] {
    this.reload();
    return [...this.records.values()]
      .filter((record) => record.jobId.length > 0)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  save(record: ReviewHandleRecord): void {
    this.persistLocked(() => this.records.set(record.idempotencyKey, record));
  }

  update(idempotencyKey: string, envelope: ReviewEnvelope): void {
    this.persistLocked(() => {
      const latest = this.records.get(idempotencyKey);
      if (!latest) return;
      latest.envelope = envelope;
      latest.lastSeenAt = new Date().toISOString();
    });
  }

  markSurfaced(idempotencyKey: string): void {
    this.persistLocked(() => {
      const latest = this.records.get(idempotencyKey);
      if (latest) latest.surfacedAt = new Date().toISOString();
    });
  }

  flush(): void {
    this.persistLocked(() => undefined);
  }

  private persistLocked<T>(operation: () => T): T {
    if (!this.filePath) {
      return operation();
    }
    const lockPath = join(dirname(this.filePath), ".handles.lock");
    let lockFd: number | undefined;
    try {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        try {
          lockFd = openSync(lockPath, "wx", 0o600);
          break;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
          try {
            if (Date.now() - statSync(lockPath).mtimeMs > 60_000) {
              unlinkSync(lockPath);
              continue;
            }
          } catch {
            // The owner may have released the lock between stat and retry.
          }
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
        }
      }
      if (lockFd === undefined) {
        throw new Error(`Review handle registry is locked: ${this.filePath}`);
      }

      // Merge against the latest disk snapshot while holding the process-wide
      // lock. This prevents concurrent Pi sessions from overwriting each other.
      try {
        const parsed = decodeRegistryFile(
          JSON.parse(readFileSync(this.filePath, "utf8"))
        );
        this.records.clear();
        for (const record of parsed.records ?? []) {
          this.records.set(record.idempotencyKey, record);
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }

      const result = operation();

      const tempPath = `${this.filePath}.${process.pid}.tmp`;
      writeFileSync(
        tempPath,
        `${JSON.stringify({ records: this.persistedRecords() } satisfies RegistryFile, null, 2)}\n`,
        { mode: 0o600 }
      );
      chmodSync(tempPath, 0o600);
      renameSync(tempPath, this.filePath);
      chmodSync(this.filePath, 0o600);
      return result;
    } finally {
      if (lockFd !== undefined) closeSync(lockFd);
      if (lockFd !== undefined) {
        try {
          unlinkSync(lockPath);
        } catch {
          // The lock may already have been cleaned up after an interrupted write.
        }
      }
    }
  }

  private persistedRecords(): ReviewHandleRecord[] {
    return [...this.records.values()].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt)
    );
  }
}

export function buildIdempotencyKey(input: {
  contentHash: string;
  criteria: ReviewCriterion[];
  dataClass?: string;
  forceNew?: boolean;
  reviewerPool: string;
  riskTier?: string;
  simulated: boolean;
  templateId: string;
}): string {
  const canonical = JSON.stringify({
    contentHash: input.contentHash,
    criteria: [...input.criteria]
      .map((criterion) => ({
        criterionId: criterion.criterionId,
        criticality: criterion.criticality ?? "major",
        humanVisibleText: criterion.humanVisibleText
      }))
      .sort((a, b) => a.criterionId.localeCompare(b.criterionId)),
    reviewerPool: input.reviewerPool,
    riskTier: input.riskTier ?? "medium",
    dataClass: input.dataClass ?? "internal_low",
    simulated: input.simulated,
    templateId: input.templateId
  });
  const digest = createHash("sha256")
    .update(input.forceNew ? `${canonical}:${randomUUID()}` : canonical)
    .digest("hex");
  return `pi-review-${digest}`;
}

function simulatedFromFeedback(
  feedback: AgentFeedback | undefined,
  fallback: boolean
): boolean {
  const providerIds = feedback?.provider_ids ?? [];
  if (providerIds.length === 0) return fallback;
  return providerIds.every(
    (providerId) => providerId === "local-provider-simulator"
  );
}

export function mapReviewResult(
  result: HumanReviewRequestResult,
  context: {
    contentHash: string;
    handle: string;
    idempotencyKey: string;
    simulated?: boolean;
  }
): ReviewEnvelope {
  const simulated = simulatedFromFeedback(
    result.feedback,
    context.simulated ?? true
  );
  if (result.feedback) {
    return {
      ...result.feedback,
      contentHash: context.contentHash,
      feedback: result.feedback,
      handle: context.handle,
      jobId: result.jobId,
      reviewTaskId: result.reviewTaskId,
      simulated,
      status: "settled"
    };
  }
  return {
    contentHash: context.contentHash,
    handle: context.handle,
    jobId: result.jobId,
    reviewTaskId: result.reviewTaskId,
    simulated,
    status: "ambient",
    stuckState: result.stuckState
  };
}

export function mapReviewError(
  error: unknown,
  context: {
    contentHash: string;
    handle?: string;
    idempotencyKey: string;
    simulated?: boolean;
  }
): ReviewEnvelope {
  if (error instanceof BrokerHttpError && error.status === 403) {
    const message =
      typeof error.body === "object" &&
      error.body !== null &&
      "message" in error.body
        ? String(error.body.message)
        : String(error.body);
    return {
      blockingReasons: [message],
      contentHash: context.contentHash,
      handle: context.handle,
      simulated: context.simulated ?? false,
      status: "not_reviewed"
    };
  }
  throw error;
}

export type ReviewRequest = (
  options: RequestHumanReviewOptions
) => Promise<HumanReviewRequestResult>;

export class PiReviewClient {
  private readonly request: ReviewRequest;

  constructor(
    private readonly options: {
      brokerBaseUrl?: string;
      currentContentHash?: (record: ReviewHandleRecord) => string | undefined;
      registry: ReviewHandleRegistry;
      requestHumanReview?: ReviewRequest;
      waitForFeedback?: typeof waitForFeedback;
    }
  ) {
    this.request = options.requestHumanReview ?? requestHumanReview;
  }

  async review(input: ReviewInput): Promise<ReviewEnvelope> {
    const brokerBaseUrl =
      input.brokerBaseUrl ??
      this.options.brokerBaseUrl ??
      "http://127.0.0.1:31337";
    const reviewerPool = input.reviewerPool ?? "managed";
    const deadlineAt =
      input.deadlineAt ?? new Date(Date.now() + 24 * 60 * 60_000).toISOString();
    const idempotencyKey = buildIdempotencyKey({
      contentHash: input.contentHash,
      criteria: input.criteria,
      dataClass: input.dataClass,
      forceNew: input.forceNew,
      reviewerPool,
      riskTier: input.riskTier,
      simulated: input.simulated,
      templateId: input.templateId
    });
    let existing = this.options.registry.get(idempotencyKey);
    if (
      existing?.envelope?.status === "settled" ||
      existing?.envelope?.status === "not_reviewed"
    ) {
      const envelope = markSettledStale(
        existing.envelope,
        existing,
        this.options.currentContentHash
      );
      if (envelope !== existing.envelope) {
        this.options.registry.update(idempotencyKey, envelope);
      }
      return envelope;
    }

    const handle = existing?.handle ?? `review-${idempotencyKey.slice(-24)}`;
    if (!existing || !existing.jobId) {
      const claim = this.options.registry.claim(
        existing ?? {
          contentHash: input.contentHash,
          createdAt: new Date().toISOString(),
          handle,
          idempotencyKey,
          jobId: "",
          lastSeenAt: new Date().toISOString(),
          reviewTaskId: "",
          workspaceRef: input.workspaceRef,
          contentSource: input.contentSource
        }
      );
      if (!claim.claimed) {
        existing = await this.waitForClaim(claim.record);
        if (existing) {
          if (
            existing.envelope?.status === "settled" ||
            existing.envelope?.status === "not_reviewed"
          ) {
            const envelope = markSettledStale(
              existing.envelope,
              existing,
              this.options.currentContentHash
            );
            if (envelope !== existing.envelope) {
              this.options.registry.update(idempotencyKey, envelope);
            }
            return envelope;
          }
        }
      } else {
        existing = undefined;
      }
    }
    if (existing) {
      const wait = this.options.waitForFeedback ?? waitForFeedback;
      const waited = await wait({
        brokerBaseUrl,
        fetchImpl: fetch,
        includeStuckStateOnTimeout: true,
        jobId: existing.jobId,
        operatorToken: input.operatorToken,
        pollIntervalMs: input.pollIntervalMs,
        signal: input.signal,
        timeoutMs: input.timeoutMs
      });
      const envelope = mapReviewResult(
        { ...existing, ...waited },
        {
          contentHash: input.contentHash,
          handle,
          idempotencyKey,
          simulated: input.simulated
        }
      );
      this.options.registry.update(idempotencyKey, envelope);
      return envelope;
    }

    try {
      const result = await this.request({
        agentControlled: input.agentControlled,
        agentRunId: input.agentRunId,
        brokerBaseUrl,
        criteria: input.criteria,
        dataClass: input.dataClass,
        deadlineAt,
        fetchImpl: fetch,
        idempotencyKey,
        operatorToken: input.operatorToken,
        pollIntervalMs: input.pollIntervalMs,
        reviewerPool,
        riskTier: input.riskTier,
        screenshot: input.screenshot,
        signal: input.signal,
        source: input.source,
        template: input.template ?? input.templateId,
        timeoutMs: input.timeoutMs
      });
      const envelope = mapReviewResult(result, {
        contentHash: input.contentHash,
        handle,
        idempotencyKey,
        simulated: input.simulated
      });
      this.options.registry.save({
        contentHash: input.contentHash,
        contentSource: input.contentSource,
        createdAt: new Date().toISOString(),
        deadlineAt,
        envelope,
        handle,
        idempotencyKey,
        jobId: result.jobId,
        lastSeenAt: new Date().toISOString(),
        reviewTaskId: result.reviewTaskId,
        workspaceRef: input.workspaceRef
      });
      return envelope;
    } catch (error) {
      const current = this.options.registry.get(idempotencyKey);
      if (error instanceof BrokerHttpError && error.status === 403) {
        const envelope = mapReviewError(error, {
          contentHash: input.contentHash,
          handle,
          idempotencyKey,
          simulated: input.simulated
        });
        if (current) this.options.registry.update(idempotencyKey, envelope);
        return envelope;
      }
      if (current) {
        const envelope: ReviewEnvelope = {
          contentHash: input.contentHash,
          handle,
          jobId: current.jobId || undefined,
          reviewTaskId: current.reviewTaskId || undefined,
          simulated: input.simulated,
          status: "ambient",
          stuckState: { dispatch_outcome: "unknown", retryable: true }
        };
        this.options.registry.update(idempotencyKey, envelope);
        return envelope;
      }
      return mapReviewError(error, {
        contentHash: input.contentHash,
        handle,
        idempotencyKey,
        simulated: input.simulated
      });
    }
  }

  async status(
    handle: string,
    input: Pick<
      ReviewInput,
      | "brokerBaseUrl"
      | "operatorToken"
      | "pollIntervalMs"
      | "signal"
      | "timeoutMs"
    >
  ): Promise<ReviewEnvelope> {
    const brokerBaseUrl =
      input.brokerBaseUrl ??
      this.options.brokerBaseUrl ??
      "http://127.0.0.1:31337";
    const record = this.options.registry
      .list()
      .find((entry) => entry.handle === handle);
    if (!record) throw new Error(`Unknown review handle: ${handle}`);
    if (record.envelope?.expired === true) {
      return record.envelope;
    }
    if (
      record.envelope?.status === "settled" ||
      record.envelope?.status === "not_reviewed"
    ) {
      const envelope = markSettledStale(
        record.envelope,
        record,
        this.options.currentContentHash
      );
      if (envelope !== record.envelope) {
        this.options.registry.update(record.idempotencyKey, envelope);
      }
      return envelope;
    }
    if (!record.jobId) {
      return (
        record.envelope ?? {
          handle: record.handle,
          simulated: false,
          status: "ambient"
        }
      );
    }
    const wait = this.options.waitForFeedback ?? waitForFeedback;
    const result = await wait({
      brokerBaseUrl,
      fetchImpl: fetch,
      includeStuckStateOnTimeout: true,
      jobId: record.jobId,
      operatorToken: input.operatorToken,
      pollIntervalMs: input.pollIntervalMs,
      signal: input.signal,
      singleCheck: true,
      timeoutMs: input.timeoutMs ?? 1_000
    });
    const envelope = mapReviewResult(
      { ...record, ...result },
      {
        contentHash: record.contentHash,
        handle: record.handle,
        idempotencyKey: record.idempotencyKey,
        simulated: record.envelope?.simulated
      }
    );
    this.options.registry.update(record.idempotencyKey, envelope);
    return envelope;
  }

  list(): ReviewHandleRecord[] {
    return this.options.registry.list();
  }

  private async waitForClaim(
    placeholder: ReviewHandleRecord
  ): Promise<ReviewHandleRecord | undefined> {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      this.options.registry.reload();
      const current = this.options.registry.get(placeholder.idempotencyKey);
      if (current?.jobId) return current;
      await new Promise((resolveSleep) => setTimeout(resolveSleep, 250));
    }
    this.options.registry.reload();
    const current = this.options.registry.get(placeholder.idempotencyKey);
    if (current?.jobId) return current;
    if (current && Date.parse(current.lastSeenAt) + 30_000 <= Date.now()) {
      const takeover = this.options.registry.claim({
        ...current,
        lastSeenAt: new Date().toISOString()
      });
      return takeover.claimed
        ? undefined
        : takeover.record.jobId
          ? takeover.record
          : undefined;
    }
    return undefined;
  }
}
