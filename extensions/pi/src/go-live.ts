import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type {
  ExtensionAPI,
  ExtensionCommandContext
} from "@earendil-works/pi-coding-agent";

export type DispatchPricing = {
  max_assignments: number;
  reward: string;
};

export function estimateDispatchCost(
  pricing: DispatchPricing | undefined
): number {
  if (!pricing) {
    throw new Error("Real dispatch cost is unavailable without task pricing");
  }
  const reward = Number(pricing.reward);
  if (
    !Number.isFinite(reward) ||
    reward <= 0 ||
    !Number.isInteger(pricing.max_assignments) ||
    pricing.max_assignments <= 0
  ) {
    throw new Error(
      "Real dispatch cost is unavailable because task pricing is invalid"
    );
  }
  return Math.round(reward * pricing.max_assignments * 1_000_000) / 1_000_000;
}

export function shouldBlockSpend(input: {
  attempted: number;
  ceiling: number;
  currentSpend: number;
}): boolean {
  return input.currentSpend + input.attempted > input.ceiling;
}

export function hasAwsCli(): boolean {
  try {
    execFileSync("aws", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export type GoLiveHooks = {
  awsAvailable: () => boolean | Promise<boolean>;
  configureRuntimeEnvFile?: (path: string) => void;
  clearRuntimeEnvFile?: () => void;
  dataDir: string;
  inFlight: () => boolean;
  restartBroker: () => Promise<unknown>;
  startBridge: () => Promise<void>;
};

export type GoLiveInput = {
  bridgeApiKeyRef: string;
  ceiling: number;
  confirmInFlight?: () => boolean | Promise<boolean>;
  confirmSpend: () => boolean | Promise<boolean>;
  maxAssignments?: number;
  maxAssignmentsPerHit?: number;
  providerSharedSecretRef: string;
};

export class GoLiveManager {
  constructor(private readonly hooks: GoLiveHooks) {}

  async activate(input: GoLiveInput): Promise<{ envFile: string }> {
    if (!(await this.hooks.awsAvailable())) {
      throw new Error(
        "Go-live requires the aws CLI; install/configure AWS CLI before retrying"
      );
    }
    assertSecretReference(input.bridgeApiKeyRef, "MTurk bridge API key");
    assertSecretReference(
      input.providerSharedSecretRef,
      "provider shared secret"
    );
    if (!Number.isFinite(input.ceiling) || input.ceiling <= 0) {
      throw new Error("Go-live spend ceiling must be a positive number");
    }

    // The high-risk template preset uses five assignments. Keep the live
    // bridge clamp compatible with that preset; the cumulative ceiling remains
    // the money boundary across all dispatches.
    const maxAssignments = input.maxAssignments ?? 5;
    const maxAssignmentsPerHit = input.maxAssignmentsPerHit ?? 5;
    if (maxAssignments > maxAssignmentsPerHit) {
      throw new Error(
        `Go-live assignment clamp rejects ${maxAssignments} assignments; bridge limit is ${maxAssignmentsPerHit}`
      );
    }

    if (this.hooks.inFlight()) {
      const confirmed = await (input.confirmInFlight ?? input.confirmSpend)();
      if (!confirmed) {
        throw new Error(
          "Cannot go live while an in-flight review exists without confirmation"
        );
      }
    }
    if (!(await input.confirmSpend())) {
      throw new Error("Go-live spend ceiling was not confirmed");
    }

    const envFile = join(this.hooks.dataDir, "live.env");
    mkdirSync(dirname(envFile), { mode: 0o700, recursive: true });
    writeFileSync(
      envFile,
      renderLiveEnv({
        bridgeApiKeyRef: input.bridgeApiKeyRef,
        ceiling: input.ceiling,
        dataDir: this.hooks.dataDir,
        maxAssignments,
        maxAssignmentsPerHit,
        providerSharedSecretRef: input.providerSharedSecretRef
      }),
      { mode: 0o600 }
    );
    chmodSync(envFile, 0o600);
    this.hooks.configureRuntimeEnvFile?.(envFile);

    try {
      await this.hooks.restartBroker();
      await this.hooks.startBridge();
    } catch (error) {
      this.hooks.clearRuntimeEnvFile?.();
      try {
        unlinkSync(envFile);
      } catch {
        // Preserve the original startup failure if cleanup is already complete.
      }
      // The broker restart may already have started live children before the
      // bridge failed. Roll back to the safe simulated mode before surfacing
      // the activation failure.
      try {
        await this.hooks.restartBroker();
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          "Go-live failed and simulated-mode rollback also failed"
        );
      }
      throw error;
    }
    return { envFile };
  }
}

export function registerGoLiveCommand(
  pi: ExtensionAPI,
  manager: GoLiveManager
): void {
  pi.registerCommand("vouch-go-live", {
    description:
      "Enable sandboxed real human reviews after a guided confirmation",
    handler: async (_args, ctx: ExtensionCommandContext) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("Go-live requires an interactive Pi session", "error");
        return;
      }
      const bridgeApiKeyRef = await ctx.ui.input(
        "MTurk bridge API key reference",
        "op://Vault/Item/field"
      );
      const providerSharedSecretRef = await ctx.ui.input(
        "Provider shared secret reference",
        "op://Vault/Item/field"
      );
      const ceilingValue = await ctx.ui.input(
        "Cumulative sandbox spend ceiling (USD)",
        "1.00"
      );
      const ceiling = Number(ceilingValue);
      if (
        !bridgeApiKeyRef ||
        !providerSharedSecretRef ||
        !Number.isFinite(ceiling)
      ) {
        ctx.ui.notify(
          "Go-live cancelled: all references and a numeric ceiling are required",
          "warning"
        );
        return;
      }

      const result = await manager.activate({
        bridgeApiKeyRef,
        ceiling,
        confirmInFlight: () =>
          ctx.ui.confirm(
            "In-flight review",
            "An ambient review is still running. Restarting keeps its durable state but may delay its callback. Continue?"
          ),
        confirmSpend: () =>
          ctx.ui.confirm(
            "Confirm sandbox spend",
            `Allow real-provider dispatches up to $${ceiling.toFixed(2)} total? Production remains disabled.`
          ),
        providerSharedSecretRef
      });
      ctx.ui.notify(
        `Go-live enabled with sandbox spend ceiling; env file: ${result.envFile}`,
        "info"
      );
    }
  });
}

function assertSecretReference(value: string, label: string): void {
  if (!/^op:\/\/[^\r\n]+$/.test(value)) {
    throw new Error(
      `${label} must be an op:// reference; secret values are not accepted`
    );
  }
}

function renderLiveEnv(input: {
  bridgeApiKeyRef: string;
  ceiling: number;
  dataDir: string;
  maxAssignments: number;
  maxAssignmentsPerHit: number;
  providerSharedSecretRef: string;
}): string {
  return (
    [
      `LOCAL_PROVIDER_MODE=disabled`,
      `VOUCH_REAL_SPEND_CEILING_USD=${input.ceiling}`,
      `PROVIDER_ENABLED=true`,
      `PROVIDER_ID=real-provider`,
      `PROVIDER_API_KEY=${input.bridgeApiKeyRef}`,
      `PROVIDER_SHARED_SECRET=${input.providerSharedSecretRef}`,
      `PROVIDER_DISPATCH_MODE=api`,
      `PROVIDER_DISPATCH_URL=http://127.0.0.1:3100/dispatch`,
      `PROVIDER_INGESTION_MODE=callback`,
      `PROVIDER_CALLBACK_BASE_URL=http://127.0.0.1:31337`,
      `MTURK_BRIDGE_API_KEY=${input.bridgeApiKeyRef}`,
      `MTURK_BROKER_CALLBACK_URL=http://127.0.0.1:31337/provider-callback`,
      `MTURK_BRIDGE_HOST=127.0.0.1`,
      `MTURK_BRIDGE_PORT=3100`,
      `MTURK_BRIDGE_STATE_PATH=${join(input.dataDir, "mturk-bridge-state.json")}`,
      `MTURK_MAX_ASSIGNMENTS=${input.maxAssignments}`,
      `MTURK_MAX_ASSIGNMENTS_PER_HIT=${input.maxAssignmentsPerHit}`,
      `MTURK_ALLOW_PRODUCTION=false`
    ].join("\n") + "\n"
  );
}
