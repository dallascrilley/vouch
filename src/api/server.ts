import { buildApp } from "./app.js";
import { loadRuntimeConfig, type RuntimeConfig } from "../config/runtime.js";

export function buildServer(config: RuntimeConfig = loadRuntimeConfig()) {
  return buildApp(config);
}

async function main() {
  const config = loadRuntimeConfig();
  const server = buildServer(config);

  // Close the server (and via its onClose hook the SQLite stores) on shutdown
  // signals so the WAL is checkpointed and in-flight requests drain cleanly.
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    server.log.info({ signal }, "shutting down");
    server.close().then(
      () => process.exit(0),
      (error) => {
        server.log.error({ err: error }, "error during shutdown");
        process.exit(1);
      }
    );
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  await server.listen({ host: "0.0.0.0", port: config.port });
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("failed to start server", error);
    process.exit(1);
  });
}
