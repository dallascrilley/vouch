import { buildMockProviderBridge } from "./lib/mock-provider-bridge.js";

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function positiveIntegerEnv(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

const config = {
  apiKey: requireEnv("MOCK_PROVIDER_BRIDGE_API_KEY"),
  brokerCallbackUrl:
    process.env.MOCK_PROVIDER_BROKER_CALLBACK_URL ??
    "http://127.0.0.1:3000/provider-callback",
  maxCallbackAttempts: positiveIntegerEnv(
    "MOCK_PROVIDER_MAX_CALLBACK_ATTEMPTS",
    3
  ),
  port: Number(process.env.MOCK_PROVIDER_BRIDGE_PORT ?? 3200),
  providerId: process.env.MOCK_PROVIDER_ID ?? "mock-second-provider",
  sharedSecret: requireEnv("PROVIDER_SHARED_SECRET"),
  statePath:
    process.env.MOCK_PROVIDER_BRIDGE_STATE_PATH ??
    ".runtime/mock-provider-bridge-state.json"
};

const app = buildMockProviderBridge(config);
await app.listen({ host: "0.0.0.0", port: config.port });
app.log.info(
  { port: config.port, providerId: config.providerId },
  "mock provider bridge listening"
);
