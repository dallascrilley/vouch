import { localQueueJobNames } from "../adapters/queue/local-queue.js";
import { buildApp } from "../api/app.js";
import { loadRuntimeConfig } from "../config/runtime.js";
import { validateRuntimeConfig } from "../config/runtime-validation.js";
import type { HumanReviewTask } from "../domain/human-review/models.js";
import { dispatchLocalProviderTask } from "./provider-dispatch-worker.js";

// A claim that fails this many times is dead-lettered rather than requeued
// forever, so one poison message cannot wedge the queue.
const MAX_CLAIM_ATTEMPTS = 5;

export async function startWorkers() {
  const config = loadRuntimeConfig();
  validateRuntimeConfig(config);
  const app = buildApp(config);
  await app.ready();

  const queueStore = app.services.queueStore;
  const recoveredClaims = await queueStore.requeueExpired(
    config.queueClaimTtlSeconds,
    new Date()
  );
  let processedClaims = 0;
  let failedClaims = 0;

  if (config.localProviderMode === "simulated") {
    while (true) {
      const claim = await queueStore.claimNext(
        localQueueJobNames.providerDispatch,
        new Date()
      );
      if (!claim) {
        break;
      }

      try {
        const reviewTask = JSON.parse(claim.payloadJson) as HumanReviewTask;
        const simulated = await dispatchLocalProviderTask(
          app.services.responseValidationService,
          reviewTask
        );
        await app.services.providerWorkflowService.maybeAutoAdvanceAfterIngest({
          deduplicated: false,
          response: simulated,
          reviewTaskId: reviewTask.reviewTaskId
        });
        await queueStore.markCompleted(claim.claimId);
        processedClaims += 1;
      } catch (error) {
        // Do not let one bad message abort the whole drain. Dead-letter once the
        // retry budget is spent; otherwise leave it claimed for requeueExpired.
        app.log.error(
          {
            claimId: claim.claimId,
            attemptCount: claim.attemptCount,
            err: error
          },
          "provider dispatch claim failed"
        );
        if (claim.attemptCount >= MAX_CLAIM_ATTEMPTS) {
          await queueStore.markFailed(claim.claimId);
          failedClaims += 1;
        }
      }
    }
  }

  return {
    databasePath: config.databasePath,
    localProviderMode: config.localProviderMode,
    logLevel: config.logLevel,
    processedClaims,
    failedClaims,
    queueClaimTtlSeconds: config.queueClaimTtlSeconds,
    recoveredClaims,
    started: true,
    async stop() {
      await app.close();
    },
    queueStore
  };
}

// The timer must stay ref'd: an unref'd idle sleep leaves the event loop empty
// between polls, so Node exits the long-lived worker as soon as the queue is
// drained.
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Long-lived worker process: repeatedly drains the queue, sleeps when idle, and
 * shuts down cleanly on SIGTERM/SIGINT so claimed work and the SQLite WAL are
 * flushed before exit (important under container orchestration).
 */
export async function runWorkerLoop(pollIntervalMs = 1000) {
  const config = loadRuntimeConfig();
  validateRuntimeConfig(config);
  const app = buildApp(config);
  await app.ready();

  const queueStore = app.services.queueStore;
  let stopping = false;

  const requestStop = () => {
    stopping = true;
  };
  process.on("SIGTERM", requestStop);
  process.on("SIGINT", requestStop);

  try {
    await queueStore.requeueExpired(config.queueClaimTtlSeconds, new Date());
    while (!stopping) {
      let drained = 0;
      if (config.localProviderMode === "simulated") {
        const claim = await queueStore.claimNext(
          localQueueJobNames.providerDispatch,
          new Date()
        );
        if (claim) {
          drained += 1;
          try {
            const reviewTask = JSON.parse(claim.payloadJson) as HumanReviewTask;
            const simulated = await dispatchLocalProviderTask(
              app.services.responseValidationService,
              reviewTask
            );
            await app.services.providerWorkflowService.maybeAutoAdvanceAfterIngest(
              {
                deduplicated: false,
                response: simulated,
                reviewTaskId: reviewTask.reviewTaskId
              }
            );
            await queueStore.markCompleted(claim.claimId);
          } catch (error) {
            app.log.error(
              {
                claimId: claim.claimId,
                attemptCount: claim.attemptCount,
                err: error
              },
              "provider dispatch claim failed"
            );
            if (claim.attemptCount >= MAX_CLAIM_ATTEMPTS) {
              await queueStore.markFailed(claim.claimId);
            }
          }
        }
      }
      if (drained === 0 && !stopping) {
        await sleep(pollIntervalMs);
      }
    }
  } finally {
    await app.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runWorkerLoop().then(
    () => process.exit(0),
    (error) => {
      console.error("worker loop terminated", error);
      process.exit(1);
    }
  );
}
