import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it, vi } from "vitest";

import {
  GoLiveManager,
  estimateDispatchCost,
  shouldBlockSpend
} from "../src/go-live.js";

describe("Pi go-live controls", () => {
  it("calculates assignment spend and blocks at the cumulative ceiling", () => {
    expect(estimateDispatchCost({ max_assignments: 3, reward: "0.10" })).toBe(
      0.3
    );
    expect(
      shouldBlockSpend({ ceiling: 1, currentSpend: 0.8, attempted: 0.3 })
    ).toBe(true);
    expect(() => estimateDispatchCost(undefined)).toThrow(/cost/i);
  });

  it("stops before writing configuration when aws is unavailable", async () => {
    const manager = new GoLiveManager({
      awsAvailable: () => false,
      dataDir: mkdtempSync(join(tmpdir(), "vouch-go-live-")),
      inFlight: () => false,
      restartBroker: vi.fn(),
      startBridge: vi.fn()
    });

    await expect(
      manager.activate({
        bridgeApiKeyRef: "op://Agent Automation/MTurk/credential",
        ceiling: 1,
        confirmSpend: () => true,
        providerSharedSecretRef: "op://Agent Automation/MTurk/shared-secret"
      })
    ).rejects.toThrow(/aws/i);
  });

  it("requires explicit confirmation before restarting around an ambient review", async () => {
    const restartBroker = vi.fn();
    const manager = new GoLiveManager({
      awsAvailable: () => true,
      dataDir: mkdtempSync(join(tmpdir(), "vouch-go-live-")),
      inFlight: () => true,
      restartBroker,
      startBridge: vi.fn()
    });

    await expect(
      manager.activate({
        bridgeApiKeyRef: "op://Agent Automation/MTurk/credential",
        ceiling: 1,
        confirmSpend: () => false,
        providerSharedSecretRef: "op://Agent Automation/MTurk/shared-secret"
      })
    ).rejects.toThrow(/in-flight/i);
    expect(restartBroker).not.toHaveBeenCalled();
  });

  it("persists only op references and gates the broker restart", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "vouch-go-live-"));
    const configureRuntimeEnvFile = vi.fn();
    const restartBroker = vi.fn(() => Promise.resolve());
    const startBridge = vi.fn(() => Promise.resolve());
    const manager = new GoLiveManager({
      awsAvailable: () => true,
      configureRuntimeEnvFile,
      dataDir,
      inFlight: () => false,
      restartBroker,
      startBridge
    });

    const result = await manager.activate({
      bridgeApiKeyRef: "op://Agent Automation/MTurk/credential",
      ceiling: 2,
      confirmSpend: () => true,
      providerSharedSecretRef: "op://Agent Automation/MTurk/shared-secret"
    });
    const content = readFileSync(result.envFile, "utf8");
    expect(content).toContain(
      "MTURK_BRIDGE_API_KEY=op://Agent Automation/MTurk/credential"
    );
    expect(content).toContain("LOCAL_PROVIDER_MODE=disabled");
    expect(content).not.toContain("resolved-secret");
    expect(statSync(result.envFile).mode & 0o777).toBe(0o600);
    expect(configureRuntimeEnvFile).toHaveBeenCalledWith(result.envFile);
    expect(restartBroker).toHaveBeenCalledOnce();
    expect(startBridge).toHaveBeenCalledOnce();
  });

  it("rolls back the live broker when bridge startup fails", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "vouch-go-live-"));
    const restartBroker = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);
    const manager = new GoLiveManager({
      awsAvailable: () => true,
      clearRuntimeEnvFile: vi.fn(),
      configureRuntimeEnvFile: vi.fn(),
      dataDir,
      inFlight: () => false,
      restartBroker,
      startBridge: vi.fn().mockRejectedValue(new Error("bridge unavailable"))
    });

    await expect(
      manager.activate({
        bridgeApiKeyRef: "op://Agent Automation/MTurk/credential",
        ceiling: 1,
        confirmSpend: () => true,
        providerSharedSecretRef: "op://Agent Automation/MTurk/shared-secret"
      })
    ).rejects.toThrow("bridge unavailable");
    expect(restartBroker).toHaveBeenCalledTimes(2);
  });
});
