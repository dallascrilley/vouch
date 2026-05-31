import { buildApp } from "./app.js";
import { loadRuntimeConfig } from "../config/runtime.js";

export function buildServer() {
  loadRuntimeConfig();
  return buildApp();
}

function main() {
  const config = loadRuntimeConfig();
  const server = buildServer();

  return server.listen({ host: "0.0.0.0", port: config.port });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
