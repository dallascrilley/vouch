import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn as nodeSpawn, type ChildProcess } from "node:child_process";

import { verifyHealthProof } from "../../../src/domain/privacy/health-proof.js";

export const BROKER_VERSION = "vouch-broker-v1";
export const DEFAULT_BROKER_PORT = 31337;

export type SpawnedChild = Pick<ChildProcess, "pid" | "kill" | "unref">;

type SpawnOptions = {
  cwd: string;
  detached: boolean;
  env: NodeJS.ProcessEnv;
  stdio: "ignore";
};

type ManagedProcessState = {
  apiPid?: number;
  bridgePid?: number;
  workerPid?: number;
};

export type BrokerSupervisorOptions = {
  dataDir?: string;
  externalBrokerUrl?: string;
  fetchImpl?: typeof fetch;
  operatorToken?: string;
  port?: number;
  repoRoot?: string;
  spawn?: (
    command: string,
    args: string[],
    options: SpawnOptions
  ) => SpawnedChild;
  requireBuiltArtifacts?: boolean;
};

export type BrokerConnection = {
  attached: boolean;
  baseUrl: string;
  external: boolean;
  operatorToken: string;
  simulated: boolean;
};

function defaultDataDir(): string {
  return process.env.VOUCH_PI_DATA_DIR ?? join(homedir(), ".vouch", "pi");
}

function defaultRepoRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
}

function validateExternalBrokerUrl(value: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Configured external broker URL is invalid");
  }
  const loopback =
    parsed.hostname === "localhost" ||
    parsed.hostname === "127.0.0.1" ||
    parsed.hostname === "::1";
  if (
    parsed.protocol !== "https:" &&
    !(parsed.protocol === "http:" && loopback)
  ) {
    throw new Error(
      "Configured external broker must use HTTPS; HTTP is allowed only for loopback"
    );
  }
}

export class BrokerSupervisor {
  private readonly dataDir: string;
  private readonly externalBrokerUrl?: string;
  private readonly fetchImpl: typeof fetch;
  private readonly port: number;
  private readonly repoRoot: string;
  private readonly spawnImpl: BrokerSupervisorOptions["spawn"];
  private readonly requireBuiltArtifacts: boolean;
  private apiChild?: SpawnedChild;
  private bridgeChild?: SpawnedChild;
  private workerChild?: SpawnedChild;
  private operatorToken?: string;
  private providerMode: "disabled" | "simulated" = "simulated";
  private runtimeEnvFile?: string;

  constructor(options: BrokerSupervisorOptions = {}) {
    this.dataDir = options.dataDir ?? defaultDataDir();
    this.externalBrokerUrl = options.externalBrokerUrl;
    if (this.externalBrokerUrl)
      validateExternalBrokerUrl(this.externalBrokerUrl);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.operatorToken =
      options.operatorToken ??
      (this.externalBrokerUrl ? process.env.VOUCH_PI_BROKER_TOKEN : undefined);
    this.port = options.port ?? DEFAULT_BROKER_PORT;
    this.repoRoot = options.repoRoot ?? defaultRepoRoot();
    this.spawnImpl =
      options.spawn ??
      ((command, args, spawnOptions) => nodeSpawn(command, args, spawnOptions));
    this.requireBuiltArtifacts = options.requireBuiltArtifacts ?? true;
    const liveEnvFile = join(this.dataDir, "live.env");
    if (existsSync(liveEnvFile)) this.runtimeEnvFile = liveEnvFile;
    this.loadManagedChildren();
  }

  get baseUrl(): string {
    return this.externalBrokerUrl ?? `http://127.0.0.1:${this.port}`;
  }

  get token(): string {
    return this.loadOperatorToken();
  }

  get isLive(): boolean {
    return this.runtimeEnvFile !== undefined;
  }

  setRuntimeEnvFile(path: string): void {
    this.runtimeEnvFile = path;
  }

  clearRuntimeEnvFile(): void {
    this.runtimeEnvFile = undefined;
  }

  async ensureRunning(): Promise<BrokerConnection> {
    if (this.externalBrokerUrl) {
      if (!this.operatorToken) {
        throw new Error(
          "Configured external broker requires broker.operatorToken or VOUCH_PI_BROKER_TOKEN"
        );
      }
      const baseUrl = this.externalBrokerUrl.replace(/\/$/, "");
      if (!(await this.probe(baseUrl))) {
        throw new Error(
          `Configured external broker failed authenticated ${BROKER_VERSION} health check at ${baseUrl}`
        );
      }
      return {
        attached: true,
        baseUrl,
        external: true,
        operatorToken: this.loadOperatorToken(),
        simulated: this.providerMode === "simulated"
      };
    }

    mkdirSync(this.dataDir, { mode: 0o700, recursive: true });
    const baseUrl = this.baseUrl;
    if ((await this.probe(baseUrl)) && this.brokerPairIsHealthy()) {
      return {
        attached: true,
        baseUrl,
        external: false,
        operatorToken: this.loadOperatorToken(),
        simulated: this.providerMode === "simulated"
      };
    }

    if (
      this.requireBuiltArtifacts &&
      (!existsSync(join(this.repoRoot, "dist/api/server.js")) ||
        !existsSync(join(this.repoRoot, "dist/workers/index.js")))
    ) {
      throw new Error(
        "Vouch broker is not built; run npm run build:js before starting the Pi extension"
      );
    }

    return this.withLifecycleLock(async () => {
      // A competing supervisor may have completed the spawn while this one
      // waited for the lock. Reload its durable ownership record before
      // deciding whether the healthy responder is ours to attach to.
      this.loadManagedChildren();
      if (
        (this.apiChild || this.workerChild) &&
        (await this.probe(baseUrl)) &&
        this.brokerPairIsHealthy()
      ) {
        return {
          attached: true,
          baseUrl,
          external: false,
          operatorToken: this.loadOperatorToken(),
          simulated: this.providerMode === "simulated"
        };
      }
      const hadManagedChildren = Boolean(this.apiChild || this.workerChild);
      this.terminateManagedChildren();
      if (hadManagedChildren) {
        let stopped = false;
        for (let attempt = 0; attempt < 80; attempt += 1) {
          if (!(await this.probe(baseUrl))) {
            stopped = true;
            break;
          }
          await new Promise((resolveSleep) => setTimeout(resolveSleep, 50));
        }
        if (!stopped) {
          throw new Error(`Vouch broker did not stop at ${baseUrl}`);
        }
      }
      if (!this.apiChild || !this.brokerPairIsHealthy()) this.spawnApiChild();
      for (let attempt = 0; attempt < 80; attempt += 1) {
        if (await this.probe(baseUrl)) {
          if (!this.workerChild) this.spawnWorkerChild();
          return {
            attached: false,
            baseUrl,
            external: false,
            operatorToken: this.loadOperatorToken(),
            simulated: this.providerMode === "simulated"
          };
        }
        await new Promise((resolveSleep) => setTimeout(resolveSleep, 50));
      }
      throw new Error(`Vouch broker did not become healthy at ${baseUrl}`);
    });
  }

  async restart(): Promise<BrokerConnection> {
    if (this.externalBrokerUrl) return this.ensureRunning();
    this.terminateManagedChildren();
    this.apiChild = undefined;
    this.bridgeChild = undefined;
    this.workerChild = undefined;
    this.persistManagedChildren();
    let stopped = false;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (!(await this.probe(this.baseUrl))) {
        stopped = true;
        break;
      }
      await new Promise((resolveSleep) => setTimeout(resolveSleep, 50));
    }
    if (!stopped) {
      throw new Error(`Vouch broker did not stop at ${this.baseUrl}`);
    }
    return this.ensureRunning();
  }

  async startBridge(): Promise<void> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        if (!this.bridgeChild) {
          const runtimeEnv = this.runtimeEnvironment();
          const spawnOptions: SpawnOptions = {
            cwd: this.repoRoot,
            detached: true,
            env: runtimeEnv,
            stdio: "ignore"
          };
          this.bridgeChild = this.spawnManaged(
            join(this.repoRoot, "node_modules/.bin/tsx"),
            [join(this.repoRoot, "scripts/mturk-bridge.ts")],
            spawnOptions
          );
          this.bridgeChild.unref();
          this.persistManagedChildren();
        }
        await this.waitForBridgeHealth();
        return;
      } catch (error) {
        lastError = error;
        this.terminateBridgeChild();
        if (attempt < 2) {
          await new Promise((resolveSleep) =>
            setTimeout(resolveSleep, 100 * (attempt + 1))
          );
        }
      }
    }
    throw new Error(
      `MTurk bridge is down after 3 bounded startup attempts: ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`,
      { cause: lastError }
    );
  }

  stop(): void {
    this.terminateManagedChildren();
    this.apiChild = undefined;
    this.workerChild = undefined;
    this.bridgeChild = undefined;
    this.persistManagedChildren();
  }

  detach(): void {
    // Detached children intentionally outlive a Pi session. Keeping the handles
    // here only makes a later restart possible; session shutdown never kills them.
    this.apiChild?.unref();
    this.bridgeChild?.unref();
    this.workerChild?.unref();
  }

  private async probe(baseUrl: string): Promise<boolean> {
    try {
      const operatorToken = this.loadOperatorToken();
      const challenge = randomUUID();
      const response = await this.fetchImpl(`${baseUrl}/health`, {
        headers: { "x-health-challenge": challenge },
        signal: AbortSignal.timeout(250)
      });
      if (!response.ok) return false;
      const payload = (await response.json()) as {
        broker_version?: string;
        health_proof?: string;
        local_provider_mode?: "disabled" | "simulated";
        status?: string;
      };
      if (
        payload.status !== "ok" ||
        payload.broker_version !== BROKER_VERSION ||
        !payload.local_provider_mode ||
        !payload.health_proof ||
        !verifyHealthProof(operatorToken, challenge, payload.health_proof)
      ) {
        return false;
      }
      this.providerMode = payload.local_provider_mode;
      return true;
    } catch {
      return false;
    }
  }

  private async waitForBridgeHealth(): Promise<void> {
    const operatorToken = this.loadOperatorToken();
    const bridgeUrl = "http://127.0.0.1:3100";
    for (let attempt = 0; attempt < 80; attempt += 1) {
      try {
        if (
          !this.bridgeChild?.pid ||
          !managedProcessMatches(
            this.bridgeChild.pid,
            "scripts/mturk-bridge.ts"
          )
        ) {
          throw new Error("managed MTurk bridge process is not alive");
        }
        const challenge = randomUUID();
        const response = await this.fetchImpl(`${bridgeUrl}/health`, {
          headers: { "x-health-challenge": challenge },
          signal: AbortSignal.timeout(250)
        });
        if (response.ok) {
          const payload = (await response.json()) as {
            ok?: boolean;
            health_proof?: string;
            provider_id?: string;
          };
          if (
            payload.ok === true &&
            payload.provider_id &&
            payload.health_proof &&
            verifyHealthProof(operatorToken, challenge, payload.health_proof)
          ) {
            return;
          }
        }
      } catch {
        // The bridge may still be starting under op run.
      }
      await new Promise((resolveSleep) => setTimeout(resolveSleep, 50));
    }
    throw new Error(
      "MTurk bridge did not become healthy at http://127.0.0.1:3100"
    );
  }

  private spawnApiChild(): void {
    const runtimeEnv = this.runtimeEnvironment();
    const spawnOptions: SpawnOptions = {
      cwd: this.repoRoot,
      detached: true,
      env: runtimeEnv,
      stdio: "ignore"
    };
    this.apiChild = this.spawnManaged(
      process.execPath,
      [join(this.repoRoot, "dist/api/server.js")],
      spawnOptions
    );
    this.apiChild.unref();
    this.persistManagedChildren();
  }

  private spawnWorkerChild(): void {
    const runtimeEnv = this.runtimeEnvironment();
    const spawnOptions: SpawnOptions = {
      cwd: this.repoRoot,
      detached: true,
      env: runtimeEnv,
      stdio: "ignore"
    };
    this.workerChild = this.spawnManaged(
      process.execPath,
      [join(this.repoRoot, "dist/workers/index.js")],
      spawnOptions
    );
    this.workerChild.unref();
    this.persistManagedChildren();
  }

  private loadManagedChildren(): void {
    try {
      const state = JSON.parse(
        readFileSync(join(this.dataDir, "processes.json"), "utf8")
      ) as ManagedProcessState;
      if (state.apiPid) {
        this.apiChild = pidChild(state.apiPid, "dist/api/server.js");
      }
      if (state.workerPid) {
        this.workerChild = pidChild(state.workerPid, "dist/workers/index.js");
      }
      if (state.bridgePid) {
        this.bridgeChild = pidChild(state.bridgePid, "scripts/mturk-bridge.ts");
      }
    } catch {
      // Missing or stale process metadata is repaired on the next spawn.
    }
  }

  private persistManagedChildren(): void {
    const path = join(this.dataDir, "processes.json");
    mkdirSync(this.dataDir, { mode: 0o700, recursive: true });
    writeFileSync(
      path,
      `${JSON.stringify({
        apiPid: this.apiChild?.pid,
        bridgePid: this.bridgeChild?.pid,
        workerPid: this.workerChild?.pid
      })}\n`,
      { mode: 0o600 }
    );
    chmodSync(path, 0o600);
  }

  private terminateManagedChildren(): void {
    for (const [child, expected] of [
      [this.apiChild, "dist/api/server.js"],
      [this.workerChild, "dist/workers/index.js"],
      [this.bridgeChild, "scripts/mturk-bridge.ts"]
    ] as const) {
      if (!child) continue;
      if (child.pid && !managedProcessMatches(child.pid, expected)) continue;
      try {
        child.kill("SIGTERM");
      } catch {
        // The detached child may already have exited.
      }
    }
    this.apiChild = undefined;
    this.workerChild = undefined;
    this.bridgeChild = undefined;
    this.persistManagedChildren();
  }

  private terminateBridgeChild(): void {
    const child = this.bridgeChild;
    if (
      child?.pid &&
      managedProcessMatches(child.pid, "scripts/mturk-bridge.ts")
    ) {
      try {
        child.kill("SIGTERM");
      } catch {
        // The detached bridge may already have exited.
      }
    }
    this.bridgeChild = undefined;
    this.persistManagedChildren();
  }

  private runtimeEnvironment(): NodeJS.ProcessEnv {
    const environment: NodeJS.ProcessEnv = {
      ...process.env,
      PORT: String(this.port),
      RUNTIME_ARTIFACT_ROOT: join(this.dataDir, "artifacts"),
      RUNTIME_HOST: "127.0.0.1",
      RUNTIME_OPERATOR_TOKEN: this.loadOperatorToken(),
      RUNTIME_SQLITE_PATH: join(this.dataDir, "local-runtime.sqlite"),
      PROVIDER_SQLITE_PATH: join(this.dataDir, "provider-state.sqlite")
    };
    if (this.runtimeEnvFile) {
      // The op env-file is the source of truth for live mode. Do not let a
      // parent Pi process silently override LOCAL_PROVIDER_MODE=disabled.
      delete environment.LOCAL_PROVIDER_MODE;
    } else {
      environment.LOCAL_PROVIDER_MODE =
        process.env.LOCAL_PROVIDER_MODE ?? "simulated";
    }
    return environment;
  }

  private spawnManaged(
    command: string,
    args: string[],
    options: SpawnOptions
  ): SpawnedChild {
    if (!this.runtimeEnvFile) {
      return this.spawnImpl!(command, args, options);
    }
    const opPath =
      process.env.VOUCH_OP_PATH ?? join(homedir(), ".local/bin/op");
    return this.spawnImpl!(
      opPath,
      ["run", "--env-file", this.runtimeEnvFile, "--", command, ...args],
      options
    );
  }

  private brokerPairIsHealthy(): boolean {
    // If no metadata exists, an authenticated/version-matched broker may have
    // been started by another supervisor. Attach rather than double-spawn.
    if (!this.apiChild && !this.workerChild) return true;
    return Boolean(
      this.apiChild?.pid &&
      managedProcessMatches(this.apiChild.pid, "dist/api/server.js") &&
      this.workerChild?.pid &&
      managedProcessMatches(this.workerChild.pid, "dist/workers/index.js")
    );
  }

  private async withLifecycleLock<T>(operation: () => Promise<T>): Promise<T> {
    const lockPath = join(this.dataDir, "broker.lock");
    let lockFd: number | undefined;
    try {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        try {
          lockFd = openSync(lockPath, "wx", 0o600);
          break;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
          try {
            if (Date.now() - statSync(lockPath).mtimeMs > 60_000) {
              unlinkSync(lockPath);
              continue;
            }
          } catch {
            // The owner may have released the lock between stat and retry.
          }
          await new Promise((resolveSleep) => setTimeout(resolveSleep, 50));
        }
      }
      if (lockFd === undefined) {
        throw new Error(`Vouch broker lifecycle is busy at ${this.dataDir}`);
      }
      return await operation();
    } finally {
      if (lockFd !== undefined) closeSync(lockFd);
      if (lockFd !== undefined) {
        try {
          unlinkSync(lockPath);
        } catch {
          // The lock may have been removed after an interrupted owner.
        }
      }
    }
  }

  private loadOperatorToken(): string {
    if (this.operatorToken) return this.operatorToken;
    const tokenPath = join(this.dataDir, "operator-token");
    mkdirSync(dirname(tokenPath), { mode: 0o700, recursive: true });
    try {
      this.operatorToken = readFileSync(tokenPath, "utf8").trim();
      if (!this.operatorToken) throw new Error("empty token");
    } catch {
      this.operatorToken = randomBytes(32).toString("base64url");
      writeFileSync(tokenPath, `${this.operatorToken}\n`, { mode: 0o600 });
      chmodSync(tokenPath, 0o600);
    }
    return this.operatorToken;
  }
}

function pidChild(pid: number, expectedCommand: string): SpawnedChild {
  return {
    kill: (signal) => {
      if (!managedProcessMatches(pid, expectedCommand)) return false;
      return process.kill(pid, signal);
    },
    pid,
    unref: () => undefined
  };
}

function managedProcessMatches(pid: number, expectedCommand: string): boolean {
  try {
    const command = execFileSync("ps", ["-p", String(pid), "-o", "command="], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
    return command.includes(expectedCommand);
  } catch {
    return false;
  }
}
