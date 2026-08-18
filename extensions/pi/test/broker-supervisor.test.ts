import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  BROKER_VERSION,
  BrokerSupervisor,
  type SpawnedChild
} from "../src/broker-supervisor.js";
import { createHealthProof } from "../../../src/domain/privacy/health-proof.js";

function child(pid: number): SpawnedChild {
  return {
    kill: vi.fn(),
    pid,
    unref: vi.fn()
  };
}

function healthResponse(dataDir: string, headers: unknown): Response {
  let challenge = "";
  if (headers instanceof Headers) {
    challenge = headers.get("x-health-challenge") ?? "";
  } else if (Array.isArray(headers)) {
    const entry = (headers as unknown[]).find(
      (value) =>
        Array.isArray(value) &&
        typeof value[0] === "string" &&
        value[0].toLowerCase() === "x-health-challenge" &&
        typeof value[1] === "string"
    );
    if (Array.isArray(entry) && typeof entry[1] === "string") {
      challenge = entry[1];
    }
  } else if (typeof headers === "object" && headers !== null) {
    const value = (headers as Record<string, unknown>)["x-health-challenge"];
    if (typeof value === "string") challenge = value;
  }
  const token = readFileSync(join(dataDir, "operator-token"), "utf8").trim();
  return new Response(
    JSON.stringify({
      broker_version: BROKER_VERSION,
      health_proof: createHealthProof(token, challenge),
      local_provider_mode: "simulated",
      status: "ok"
    }),
    { status: 200 }
  );
}

describe("BrokerSupervisor", () => {
  it("writes a private token and spawns an authenticated loopback broker pair", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "vouch-pi-supervisor-"));
    const children: SpawnedChild[] = [];
    const spawn = vi.fn((command: string, args: string[], options: unknown) => {
      void command;
      void args;
      void options;
      const process = child(children.length + 10);
      children.push(process);
      return process;
    });
    let probeCount = 0;
    const fetchImpl = vi.fn(
      (_input: string | URL | Request, init?: RequestInit) => {
        probeCount += 1;
        return probeCount === 1
          ? Promise.reject(new Error("connection refused"))
          : Promise.resolve(healthResponse(dataDir, init?.headers));
      }
    );
    const supervisor = new BrokerSupervisor({
      dataDir,
      fetchImpl,
      repoRoot: "/repo",
      spawn,
      requireBuiltArtifacts: false
    });

    const result = await supervisor.ensureRunning();

    expect(result.attached).toBe(false);
    expect(children).toHaveLength(2);
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(spawn.mock.calls[0]?.[2]).toMatchObject({
      detached: true,
      stdio: "ignore"
    });
    const env = spawn.mock.calls[0]?.[2] as { env: NodeJS.ProcessEnv };
    expect(env.env.RUNTIME_HOST).toBe("127.0.0.1");
    expect(env.env.RUNTIME_SQLITE_PATH).toBe(
      join(dataDir, "local-runtime.sqlite")
    );
    expect(env.env.RUNTIME_OPERATOR_TOKEN).toBeTruthy();
    expect(statSync(join(dataDir, "operator-token")).mode & 0o777).toBe(0o600);
    expect(readFileSync(join(dataDir, "operator-token"), "utf8").trim()).toBe(
      env.env.RUNTIME_OPERATOR_TOKEN
    );
  });

  it("attaches to a matching broker without spawning another pair", async () => {
    const spawn = vi.fn();
    const dataDir = mkdtempSync(join(tmpdir(), "vouch-pi-supervisor-"));
    const fetchImpl = vi.fn(
      (_input: string | URL | Request, init?: RequestInit) =>
        Promise.resolve(healthResponse(dataDir, init?.headers))
    );
    const supervisor = new BrokerSupervisor({
      dataDir,
      fetchImpl,
      spawn
    });

    const result = await supervisor.ensureRunning();

    expect(result.attached).toBe(true);
    expect(spawn).not.toHaveBeenCalled();
  });

  it("respawns both children after terminating an unhealthy pair", async () => {
    const spawnArgs: string[][] = [];
    const spawn = vi.fn((command: string, args: string[], options: unknown) => {
      void command;
      void options;
      spawnArgs.push(args);
      return child(spawnArgs.length + 100);
    });
    let probeCount = 0;
    const dataDir = mkdtempSync(join(tmpdir(), "vouch-pi-supervisor-"));
    const fetchImpl = vi.fn(
      (_input: string | URL | Request, init?: RequestInit) => {
        probeCount += 1;
        return probeCount < 4
          ? Promise.reject(new Error("connection refused"))
          : Promise.resolve(healthResponse(dataDir, init?.headers));
      }
    );
    const supervisor = new BrokerSupervisor({
      dataDir,
      fetchImpl,
      repoRoot: "/repo",
      spawn,
      requireBuiltArtifacts: false
    });
    const internal = supervisor as unknown as {
      apiChild: SpawnedChild;
      workerChild: SpawnedChild;
    };
    internal.apiChild = child(10);
    internal.workerChild = child(11);

    await supervisor.ensureRunning();

    expect(spawn).toHaveBeenCalledTimes(2);
    expect(spawnArgs[0]).toEqual(["/repo/dist/api/server.js"]);
    expect(spawnArgs[1]).toEqual(["/repo/dist/workers/index.js"]);
  });

  it("never spawns when an external broker is configured, even when unhealthy", async () => {
    const spawn = vi.fn();
    const fetchImpl = vi.fn(() =>
      Promise.reject(new Error("external broker unavailable"))
    );
    const supervisor = new BrokerSupervisor({
      externalBrokerUrl: "https://broker.example.test",
      fetchImpl,
      operatorToken: "external-token",
      spawn
    });

    await expect(supervisor.ensureRunning()).rejects.toThrow(/authenticated/);
    expect(spawn).not.toHaveBeenCalled();
  });

  it("rejects an external broker with an invalid health proof", async () => {
    const spawn = vi.fn();
    const fetchImpl = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            broker_version: BROKER_VERSION,
            health_proof: "wrong-proof",
            local_provider_mode: "simulated",
            status: "ok"
          }),
          { status: 200 }
        )
      )
    );
    const supervisor = new BrokerSupervisor({
      externalBrokerUrl: "https://broker.example.test",
      fetchImpl,
      operatorToken: "external-token",
      spawn
    });

    await expect(supervisor.ensureRunning()).rejects.toThrow(/authenticated/);
    expect(spawn).not.toHaveBeenCalled();
  });

  it("rejects plaintext credentials to a non-loopback external broker", () => {
    expect(
      () =>
        new BrokerSupervisor({
          externalBrokerUrl: "http://broker.example.test",
          operatorToken: "external-token"
        })
    ).toThrow("must use HTTPS");
  });

  it("requires an explicit token for an external broker", async () => {
    const supervisor = new BrokerSupervisor({
      externalBrokerUrl: "https://broker.example.test",
      fetchImpl: vi.fn(),
      operatorToken: ""
    });

    await expect(supervisor.ensureRunning()).rejects.toThrow(
      "requires broker.operatorToken or VOUCH_PI_BROKER_TOKEN"
    );
  });
});
