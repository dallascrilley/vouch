import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import {
  BrokerSupervisor,
  type BrokerSupervisorOptions
} from "./broker-supervisor.js";
import { registerReviewTools } from "./tools.js";
import { PiReviewClient, ReviewHandleRegistry } from "./review-client.js";
import {
  registerSessionLifecycle,
  SessionReviewTracker,
  terminalRecord
} from "./session.js";
import { registerReviewCommand, ReviewUi } from "./ui.js";
import { GoLiveManager, hasAwsCli, registerGoLiveCommand } from "./go-live.js";

export type PiExtensionOptions = {
  broker?: BrokerSupervisorOptions;
  dataDir?: string;
  defaultTimeoutMs?: number;
};

function currentContentHash(record: {
  contentSource?: { kind: "file" | "git_diff"; path?: string };
  workspaceRef?: string;
}): string | undefined {
  if (!record.workspaceRef || !record.contentSource) return undefined;
  try {
    const content =
      record.contentSource.kind === "file"
        ? readFileSync(record.contentSource.path ?? "")
        : execFileSync("git", ["diff", "--binary", "HEAD", "--"], {
            cwd: record.workspaceRef,
            encoding: "buffer",
            maxBuffer: 2_000_000
          });
    return createHash("sha256").update(content).digest("hex");
  } catch {
    return undefined;
  }
}

function defaultDataDir(): string {
  return process.env.VOUCH_PI_DATA_DIR ?? join(homedir(), ".vouch", "pi");
}

export function createPiExtension(
  pi: ExtensionAPI,
  options: PiExtensionOptions = {}
): void {
  const dataDir = options.dataDir ?? defaultDataDir();
  const supervisor = new BrokerSupervisor({
    ...options.broker,
    dataDir,
    externalBrokerUrl:
      options.broker?.externalBrokerUrl ?? process.env.VOUCH_PI_BROKER_URL
  });
  const registry = new ReviewHandleRegistry(join(dataDir, "handles.json"));
  const client = new PiReviewClient({ currentContentHash, registry });
  const uiBySession = new WeakMap<object, ReviewUi>();
  const uiFor = (ctx: {
    ui: ConstructorParameters<typeof ReviewUi>[0];
  }): ReviewUi => {
    const existing = uiBySession.get(ctx.ui);
    if (existing) return existing;
    const created = new ReviewUi(ctx.ui);
    uiBySession.set(ctx.ui, created);
    return created;
  };

  // Resource startup is intentionally deferred until a tool, command, or
  // lifecycle hook needs the broker. Pi may load extensions without starting a
  // session, and the broker must not be spawned from this factory.
  registerReviewTools(pi, {
    client,
    defaultTimeoutMs: options.defaultTimeoutMs,
    supervisor,
    uiFactory: uiFor
  });
  registerReviewCommand(pi, {
    client,
    supervisor,
    uiFactory: uiFor
  });
  const goLive = new GoLiveManager({
    awsAvailable: hasAwsCli,
    clearRuntimeEnvFile: () => supervisor.clearRuntimeEnvFile(),
    configureRuntimeEnvFile: (path) => supervisor.setRuntimeEnvFile(path),
    dataDir,
    inFlight: () => client.list().some((record) => !terminalRecord(record)),
    restartBroker: () => supervisor.restart(),
    startBridge: () => supervisor.startBridge()
  });
  registerGoLiveCommand(pi, goLive);
  registerSessionLifecycle(
    pi,
    new SessionReviewTracker({
      client,
      currentContentHash,
      registry,
      supervisor
    })
  );
}

export default function piExtension(pi: ExtensionAPI): void {
  createPiExtension(pi);
}
