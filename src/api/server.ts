import Fastify from "fastify";

import { loadRuntimeConfig } from "../config/runtime.js";

export function buildServer() {
  const config = loadRuntimeConfig();

  return Fastify({
    logger: {
      level: config.logLevel
    }
  });
}

function main() {
  const config = loadRuntimeConfig();
  const server = buildServer();

  server.get("/health", () => ({
    status: "ok"
  }));

  return server.listen({ host: "0.0.0.0", port: config.port });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
