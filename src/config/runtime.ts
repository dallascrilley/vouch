export type RuntimeConfig = {
  artifactRoot: string;
  databasePath: string;
  localProviderMode: "disabled" | "simulated";
  nodeEnv: string;
  port: number;
  providerStateDbPath?: string;
  providerValidationScript: string;
  queueClaimTtlSeconds: number;
  runtimeValidationScript: string;
  logLevel: string;
  operatorToken?: string;
  releaseGateSigningKey?: string;
};

const DEFAULT_PORT = 3000;
const DEFAULT_QUEUE_CLAIM_TTL_SECONDS = 300;

export function loadRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const portValue = env.PORT ?? `${DEFAULT_PORT}`;
  const port = Number.parseInt(portValue, 10);
  const queueClaimTtlValue = env.RUNTIME_QUEUE_CLAIM_TTL_SECONDS ?? `${DEFAULT_QUEUE_CLAIM_TTL_SECONDS}`;
  const queueClaimTtlSeconds = Number.parseInt(queueClaimTtlValue, 10);

  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`Invalid PORT value: ${portValue}`);
  }

  if (!Number.isFinite(queueClaimTtlSeconds) || queueClaimTtlSeconds <= 0) {
    throw new Error(`Invalid RUNTIME_QUEUE_CLAIM_TTL_SECONDS value: ${queueClaimTtlValue}`);
  }

  const databasePath = env.RUNTIME_SQLITE_PATH ?? (env.VITEST ? ":memory:" : ".runtime/local-runtime.sqlite");
  const artifactRoot = env.RUNTIME_ARTIFACT_ROOT ?? ".runtime/artifacts";
  const localProviderMode = env.LOCAL_PROVIDER_MODE === "disabled" ? "disabled" : "simulated";

  return {
    artifactRoot,
    databasePath,
    localProviderMode,
    nodeEnv: env.NODE_ENV ?? "development",
    port,
    providerStateDbPath:
      env.PROVIDER_SQLITE_PATH ??
      (env.VITEST ? undefined : ".runtime/provider-state.sqlite"),
    providerValidationScript: env.PROVIDER_VALIDATION_SCRIPT ?? "npm run validate:provider",
    queueClaimTtlSeconds,
    runtimeValidationScript: "npm run validate:local-runtime",
    logLevel: env.LOG_LEVEL ?? "info",
    operatorToken: env.RUNTIME_OPERATOR_TOKEN,
    releaseGateSigningKey: env.RELEASE_GATE_SIGNING_KEY
  };
}
