import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildApp } from "../../src/api/app.js";
import { loadRuntimeConfig } from "../../src/config/runtime.js";

export type TransportResponse = { status: number; body: unknown };

export interface BrokerTransport {
  get(path: string): Promise<TransportResponse>;
  post(path: string, payload: unknown): Promise<TransportResponse>;
  close(): Promise<void>;
}

export class HttpBrokerTransport implements BrokerTransport {
  constructor(
    private readonly baseUrl: string,
    private readonly operatorToken?: string
  ) {}

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      "content-type": "application/json"
    };
    if (this.operatorToken) {
      headers["x-operator-token"] = this.operatorToken;
    }
    return headers;
  }

  async post(path: string, payload: unknown): Promise<TransportResponse> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      body: JSON.stringify(payload),
      headers: this.headers(),
      method: "POST"
    });
    return { status: res.status, body: await this.parse(res) };
  }

  async get(path: string): Promise<TransportResponse> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: this.headers()
    });
    return { status: res.status, body: await this.parse(res) };
  }

  private async parse(res: globalThis.Response): Promise<unknown> {
    const text = await res.text();
    return text ? (JSON.parse(text) as unknown) : null;
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}

export class InProcessBrokerTransport implements BrokerTransport {
  private constructor(
    private readonly app: ReturnType<typeof buildApp>,
    private readonly cleanup: () => void
  ) {}

  static async create(): Promise<InProcessBrokerTransport> {
    let cleanup = (): void => {};
    const env = { ...process.env };
    env.RELEASE_GATE_SIGNING_KEY ??= "local-dev-release-gate-key";
    if (!env.RUNTIME_SQLITE_PATH) {
      const runtimeRoot = mkdtempSync(join(tmpdir(), "broker-client-"));
      env.RUNTIME_SQLITE_PATH = join(runtimeRoot, "runtime.sqlite");
      env.RUNTIME_ARTIFACT_ROOT = join(runtimeRoot, "artifacts");
      env.PROVIDER_SQLITE_PATH = join(runtimeRoot, "provider-state.sqlite");
      cleanup = (): void =>
        rmSync(runtimeRoot, { force: true, recursive: true });
    }
    const app = buildApp(loadRuntimeConfig(env));
    await app.ready();
    return new InProcessBrokerTransport(app, cleanup);
  }

  async post(path: string, payload: unknown): Promise<TransportResponse> {
    const res = await this.app.inject({
      method: "POST",
      payload: payload as object,
      url: path
    });
    return { status: res.statusCode, body: res.body ? res.json() : null };
  }

  async get(path: string): Promise<TransportResponse> {
    const res = await this.app.inject({ method: "GET", url: path });
    return { status: res.statusCode, body: res.body ? res.json() : null };
  }

  async close(): Promise<void> {
    await this.app.close();
    this.cleanup();
  }
}

export async function connectBrokerTransport(
  env: NodeJS.ProcessEnv = process.env
): Promise<BrokerTransport> {
  if (env.BROKER_URL) {
    return new HttpBrokerTransport(
      env.BROKER_URL.replace(/\/$/, ""),
      env.RUNTIME_OPERATOR_TOKEN
    );
  }
  return InProcessBrokerTransport.create();
}

export function expectStatus(
  res: TransportResponse,
  allowed: number[],
  context: string
): void {
  if (!allowed.includes(res.status)) {
    const detail =
      res.body && typeof res.body === "object" && "message" in res.body
        ? String(res.body.message)
        : JSON.stringify(res.body);
    throw new Error(`${context} failed (${res.status}): ${detail}`);
  }
}
