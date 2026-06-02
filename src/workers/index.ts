import { localQueueJobNames } from "../adapters/queue/local-queue.js";
import { buildApp } from "../api/app.js";
import { loadRuntimeConfig } from "../config/runtime.js";
import { validateRuntimeConfig } from "../config/runtime-validation.js";
import type { HumanReviewTask } from "../domain/human-review/models.js";
import { dispatchLocalProviderTask } from "./provider-dispatch-worker.js";

export async function startWorkers() {
  const config = loadRuntimeConfig();
  validateRuntimeConfig(config);
  const app = buildApp(config);
  await app.ready();

  const queueStore = app.services.queueStore;
  const recoveredClaims = await queueStore.requeueExpired(config.queueClaimTtlSeconds, new Date());
  let processedClaims = 0;

  if (config.localProviderMode === "simulated") {
    while (true) {
      const claim = await queueStore.claimNext(localQueueJobNames.providerDispatch, new Date());
      if (!claim) {
        break;
      }

      const reviewTask = JSON.parse(claim.payloadJson) as HumanReviewTask;
      await dispatchLocalProviderTask(app.services.responseValidationService, reviewTask);
      await queueStore.markCompleted(claim.claimId);
      processedClaims += 1;
    }
  }

  return {
    databasePath: config.databasePath,
    localProviderMode: config.localProviderMode,
    logLevel: config.logLevel,
    processedClaims,
    queueClaimTtlSeconds: config.queueClaimTtlSeconds,
    recoveredClaims,
    started: true,
    async stop() {
      await app.close();
    },
    queueStore
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void startWorkers();
}
