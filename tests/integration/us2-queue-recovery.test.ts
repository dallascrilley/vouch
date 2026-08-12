import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../../src/api/app.js";
import { localQueueJobNames } from "../../src/adapters/queue/local-queue.js";
import { loadRuntimeConfig } from "../../src/config/runtime.js";
import { startWorkers } from "../../src/workers/index.js";

describe("US2 queue recovery", () => {
  let runtimeRoot: string;

  beforeEach(() => {
    runtimeRoot = mkdtempSync(join(tmpdir(), "us2-recovery-"));
  });

  afterEach(() => {
    rmSync(runtimeRoot, { force: true, recursive: true });
    delete process.env.RUNTIME_ARTIFACT_ROOT;
    delete process.env.RUNTIME_SQLITE_PATH;
    delete process.env.RUNTIME_QUEUE_CLAIM_TTL_SECONDS;
  });

  it("requeues expired provider-dispatch claims and finishes processing them on worker start", async () => {
    const config = loadRuntimeConfig({
      ...process.env,
      RUNTIME_ARTIFACT_ROOT: join(runtimeRoot, "artifacts"),
      RUNTIME_SQLITE_PATH: join(runtimeRoot, "runtime.sqlite"),
      RUNTIME_QUEUE_CLAIM_TTL_SECONDS: "1"
    });
    const app = buildApp(config);
    await app.ready();

    const create = await app.inject({
      method: "POST",
      url: "/verification-jobs",
      payload: {
        acceptance_criteria: [
          {
            criterion_id: "queue-recovery",
            criticality: "critical",
            evidence_requirements: ["screenshot"],
            human_visible_text: "Queue claims recover"
          }
        ],
        budget_policy: { maxAssignments: 2, maxJobCost: 10, maxRetries: 1 },
        deadline_at: "2026-06-01T00:00:00.000Z",
        idempotency_key: "queue-recovery",
        risk_tier: "low",
        source: {
          repository: "repo",
          commit: "abc123",
          environment: "local",
          route: "/queue-recovery"
        }
      }
    });
    const jobId = create.json<{ job_id: string }>().job_id;

    await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/artifacts`,
      payload: {
        manifest_id: "manifest-queue-recovery",
        job_id: jobId,
        raw_artifacts: [
          {
            artifact_id: "artifact-queue-recovery",
            artifact_type: "screenshot",
            content_hash: "hash-queue-recovery",
            provenance: "playwright"
          }
        ],
        artifact_quality: "sufficient",
        environment: {
          repository: "repo",
          commit: "abc123",
          environment: "local",
          route: "/queue-recovery"
        }
      }
    });
    await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/privacy-classification`,
      payload: {
        classification_id: "classification-queue-recovery",
        job_id: jobId,
        artifact_manifest_id: "manifest-queue-recovery",
        data_class: "public",
        redaction_status: "completed",
        policy_version: "v1",
        externalization_decision: "allowed",
        audit_record_id: "audit-queue-recovery"
      }
    });
    const task = await app.inject({
      method: "POST",
      url: `/verification-jobs/${jobId}/human-review-tasks`,
      payload: {
        criterion_ids: ["queue-recovery"],
        deadline_at: "2026-06-01T01:00:00.000Z",
        quality_policy: "default",
        reviewer_pool: "public_crowd",
        sanitized_package_id: "pkg-queue-recovery",
        task_template: "Recover the expired queue claim"
      }
    });
    const reviewTaskId = task.json<{ review_task_id: string }>().review_task_id;

    const claimed = await app.services.queueStore.claimNext(
      localQueueJobNames.providerDispatch,
      new Date()
    );
    expect(claimed?.jobId).toBe(jobId);

    await app.services.queueStore.requeueExpired(
      1,
      new Date((claimed?.claimedAt ?? new Date()).getTime() + 2_000)
    );
    await app.close();

    process.env.RUNTIME_ARTIFACT_ROOT = config.artifactRoot;
    process.env.RUNTIME_SQLITE_PATH = config.databasePath;
    process.env.RUNTIME_QUEUE_CLAIM_TTL_SECONDS = "1";

    const worker = await startWorkers();
    expect(worker.recoveredClaims).toBeGreaterThanOrEqual(0);
    expect(worker.processedClaims).toBe(1);
    await worker.stop();

    const restarted = buildApp(config);
    await restarted.ready();
    const responses =
      await restarted.services.runtimeRepositories.humanResponseRepository.findByReviewTaskId(
        reviewTaskId
      );
    await restarted.close();

    expect(responses).toHaveLength(1);
  });
});
