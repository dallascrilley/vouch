/**
 * Agent loop validation: spawns API + simulated worker, runs `npm run review --wait`,
 * asserts exit 0 and agent_next_action pass.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL("..", import.meta.url)));
const MINIMAL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

type ReviewResult = {
  agent_next_action?: string;
  final_verdict?: string;
  job_id?: string;
};

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate port"));
        return;
      }
      const port = address.port;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function waitForHealth(
  baseUrl: string,
  timeoutMs: number,
  operatorToken: string
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`, {
        headers: { "x-operator-token": operatorToken }
      });
      if (response.ok) {
        return;
      }
    } catch {
      // retry
    }
    await sleep(200);
  }
  throw new Error(
    `Broker did not become healthy at ${baseUrl} within ${timeoutMs}ms`
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Long-lived children (API, worker) run `tsx`, which itself spawns a node
// child. Signalling only the direct child leaves that grandchild alive, its
// stdio pipes open, and this process unable to exit — which hangs CI forever.
// So detach each one into its own process group and signal the whole group.
function spawnProcess(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  options: { detached?: boolean } = {}
): ChildProcess {
  return spawn(command, args, {
    cwd: ROOT,
    detached: options.detached ?? false,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function signalGroup(child: ChildProcess, signal: NodeJS.Signals) {
  if (!child.pid) {
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // already gone
    }
  }
}

async function killProcess(child: ChildProcess | undefined, label: string) {
  if (!child?.pid || child.exitCode !== null) {
    return;
  }
  const exited = new Promise<void>((resolve) =>
    child.once("exit", () => resolve())
  );
  signalGroup(child, "SIGTERM");
  const timedOut = await Promise.race([
    exited.then(() => false),
    sleep(3000).then(() => true)
  ]);
  if (timedOut) {
    signalGroup(child, "SIGKILL");
    await Promise.race([exited, sleep(2000)]);
  }
  child.stdout?.destroy();
  child.stderr?.destroy();
  if (child.exitCode === null && !child.killed) {
    console.error(`warn: ${label} did not exit cleanly`);
  }
}

function appendChunk(buffer: string, chunk: unknown): string {
  if (typeof chunk === "string") {
    return buffer + chunk;
  }
  if (chunk instanceof Buffer) {
    return buffer + chunk.toString("utf8");
  }
  return buffer + String(chunk);
}

async function runReviewCli(input: {
  baseUrl: string;
  operatorToken: string;
  screenshotPath: string;
}): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawnProcess(
      "npx",
      [
        "tsx",
        "scripts/request-review.ts",
        "--template",
        "binary_screenshot_check",
        "--question",
        "agent-loop-check:A minimal visible element exists in the screenshot.",
        "--screenshot",
        input.screenshotPath,
        "--risk",
        "medium",
        "--broker-url",
        input.baseUrl,
        "--timeout-seconds",
        "45",
        "--poll-seconds",
        "1",
        "--wait"
      ],
      { RUNTIME_OPERATOR_TOKEN: input.operatorToken }
    );

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout = appendChunk(stdout, chunk);
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr = appendChunk(stderr, chunk);
    });
    child.on("close", (code) => {
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
  });
}

function parseReviewStdout(stdout: string): ReviewResult {
  const text = stdout.trim();
  const start = text.indexOf("{");
  if (start < 0) {
    throw new Error(`review CLI did not emit JSON on stdout:\n${stdout}`);
  }
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(text.slice(start, index + 1)) as ReviewResult;
      }
    }
  }
  throw new Error(
    `review CLI stdout did not contain complete JSON:\n${stdout}`
  );
}

async function main() {
  const tempDir = mkdtempSync(join(tmpdir(), "agent-loop-validate-"));
  const sqlitePath = join(tempDir, "runtime.sqlite");
  const screenshotPath = join(tempDir, "pixel.png");
  writeFileSync(screenshotPath, MINIMAL_PNG);

  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const runtimeEnv = {
    LOCAL_PROVIDER_MODE: "simulated",
    LOG_LEVEL: "error",
    PORT: String(port),
    RUNTIME_ARTIFACT_ROOT: join(tempDir, "artifacts"),
    RUNTIME_OPERATOR_TOKEN: "agent-loop-test-token",
    RUNTIME_SQLITE_PATH: sqlitePath
  };

  let api: ChildProcess | undefined;
  let worker: ChildProcess | undefined;

  try {
    api = spawnProcess("npx", ["tsx", "src/api/server.ts"], runtimeEnv, {
      detached: true
    });

    api.stderr?.on("data", (chunk: Buffer | string) => {
      const line = appendChunk("", chunk);
      if (/error|fatal/i.test(line)) {
        process.stderr.write(`[api] ${line}`);
      }
    });

    await waitForHealth(baseUrl, 15_000, runtimeEnv.RUNTIME_OPERATOR_TOKEN);
    await sleep(500);
    worker = spawnProcess("npx", ["tsx", "src/workers/index.ts"], runtimeEnv, {
      detached: true
    });

    worker.stderr?.on("data", (chunk: Buffer | string) => {
      const line = appendChunk("", chunk);
      if (/error|fatal/i.test(line)) {
        process.stderr.write(`[worker] ${line}`);
      }
    });

    await sleep(500);

    const review = await runReviewCli({
      baseUrl,
      operatorToken: runtimeEnv.RUNTIME_OPERATOR_TOKEN,
      screenshotPath
    });
    if (review.exitCode !== 0) {
      throw new Error(
        `review CLI exited ${review.exitCode}\nstdout:\n${review.stdout}\nstderr:\n${review.stderr}\n` +
          "Ensure dev:worker is running — simulated jobs need the queue worker."
      );
    }

    const payload = parseReviewStdout(review.stdout);
    if (payload.agent_next_action !== "pass") {
      throw new Error(
        `expected agent_next_action pass, got ${JSON.stringify(payload)}`
      );
    }

    console.log(
      JSON.stringify(
        {
          agent_next_action: payload.agent_next_action,
          final_verdict: payload.final_verdict,
          job_id: payload.job_id,
          status: "agent loop validation passed"
        },
        null,
        2
      )
    );
  } finally {
    await killProcess(worker, "worker");
    await killProcess(api, "api");
    rmSync(tempDir, { force: true, recursive: true });
  }
}

main()
  .then(() => {
    // Exit explicitly: a stray handle from a spawned child must never leave
    // this harness hanging instead of reporting a result.
    process.exit(0);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
