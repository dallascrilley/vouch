export type RuntimeConfig = {
  nodeEnv: string;
  port: number;
  logLevel: string;
};

const DEFAULT_PORT = 3000;

export function loadRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const portValue = env.PORT ?? `${DEFAULT_PORT}`;
  const port = Number.parseInt(portValue, 10);

  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`Invalid PORT value: ${portValue}`);
  }

  return {
    nodeEnv: env.NODE_ENV ?? "development",
    port,
    logLevel: env.LOG_LEVEL ?? "info"
  };
}
