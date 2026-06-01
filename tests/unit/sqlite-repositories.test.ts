import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createSQLiteRuntimeRepositories,
  SQLiteLocalQueueStore
} from "../../src/adapters/storage/sqlite-repositories.js";
import type { VerificationJob } from "../../src/domain/jobs/models.js";

describe("sqlite repositories", () => {
  const cleanupPaths: string[] = [];

  afterEach(() => {
    while (cleanupPaths.length > 0) {
      const path = cleanupPaths.pop();
      if (path) {
        rmSync(path, { force: true, recursive: true });
      }
    }
  });

  it("persists jobs and verdicts across store instances", async () => {
    const root = mkdtempSync(join(tmpdir(), "sqlite-runtime-"));
    cleanupPaths.push(root);
    const databasePath = join(root, "runtime.sqlite");
    const first = createSQLiteRuntimeRepositories(databasePath);

    const job: VerificationJob = {
      acceptanceCriteria: [],
      budgetPolicyId: "budget_job-1",
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
      deadlineAt: new Date("2026-06-02T00:00:00.000Z"),
      idempotencyKey: "same-key",
      jobId: "job-1",
      riskTier: "low",
      source: {
        commit: "abc123",
        environment: "local",
        featureFlags: [],
        repository: "repo",
        route: "/demo"
      },
      state: "created",
      updatedAt: new Date("2026-06-01T00:00:00.000Z")
    };

    await first.jobRepository.save(job);
    await first.finalVerdictRepository.save({
      confidence: "high",
      createdAt: new Date("2026-06-01T00:05:00.000Z"),
      criterionOutcomes: [],
      evidenceRefs: [],
      finalVerdict: "pass",
      jobId: "job-1",
      maxSeverity: "none",
      releaseGateEffect: "allow",
      verdictId: "verdict_job-1"
    });
    first.store.close();

    const second = createSQLiteRuntimeRepositories(databasePath);
    const persistedJob = await second.jobRepository.findById("job-1");
    const persistedVerdict = await second.finalVerdictRepository.findByJobId("job-1");
    second.store.close();

    expect(persistedJob?.idempotencyKey).toBe("same-key");
    expect(persistedVerdict?.finalVerdict).toBe("pass");
  });

  it("requeues expired local queue claims", async () => {
    const root = mkdtempSync(join(tmpdir(), "sqlite-queue-"));
    cleanupPaths.push(root);
    const databasePath = join(root, "runtime.sqlite");
    const repositories = createSQLiteRuntimeRepositories(databasePath);
    const queueStore = new SQLiteLocalQueueStore(repositories.store);

    await queueStore.enqueue({
      attemptCount: 0,
      availableAt: new Date("2026-06-01T00:00:00.000Z"),
      claimId: "claim-1",
      jobId: "job-1",
      jobName: "self-verification",
      payloadJson: "{\"jobId\":\"job-1\"}",
      state: "queued"
    });

    const claimed = await queueStore.claimNext("self-verification", new Date("2026-06-01T00:00:10.000Z"));
    expect(claimed?.state).toBe("claimed");

    const requeued = await queueStore.requeueExpired(5, new Date("2026-06-01T00:00:20.000Z"));
    const reclaimed = await queueStore.claimNext("self-verification", new Date("2026-06-01T00:00:21.000Z"));
    repositories.store.close();

    expect(requeued).toBe(1);
    expect(reclaimed?.attemptCount).toBe(2);
  });
});
