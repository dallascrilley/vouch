import { createSQLiteRuntimeRepositories, SQLiteLocalQueueStore } from "../adapters/storage/sqlite-repositories.js";
import { loadRuntimeConfig } from "../config/runtime.js";
import { validateRuntimeConfig } from "../config/runtime-validation.js";

export function startWorkers() {
  const config = loadRuntimeConfig();
  validateRuntimeConfig(config);
  const runtimeRepositories = createSQLiteRuntimeRepositories(config.databasePath);
  const queueStore = new SQLiteLocalQueueStore(runtimeRepositories.store);

  return {
    databasePath: config.databasePath,
    localProviderMode: config.localProviderMode,
    logLevel: config.logLevel,
    queueClaimTtlSeconds: config.queueClaimTtlSeconds,
    recoveredClaims: 0,
    started: true,
    stop() {
      runtimeRepositories.store.close();
    },
    queueStore
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void startWorkers();
}
