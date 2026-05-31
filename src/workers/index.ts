import { loadRuntimeConfig } from "../config/runtime.js";

export function startWorkers() {
  const config = loadRuntimeConfig();

  return {
    logLevel: config.logLevel,
    started: true
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void startWorkers();
}
