import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

import {
  registerReviewCommand,
  ReviewUi,
  renderReviewWidget
} from "../src/ui.js";

describe("Pi review UI", () => {
  it("renders concurrent reviews and off-path states without clobbering", () => {
    const lines = renderReviewWidget([
      {
        handle: "review-a",
        simulated: true,
        status: "ambient",
        responsesReceived: 1
      },
      {
        blockedReason: "spend ceiling reached",
        handle: "review-b",
        simulated: false,
        status: "spend-blocked"
      },
      {
        handle: "review-c",
        simulated: false,
        stale: true,
        status: "stale"
      }
    ]);

    expect(lines.join("\n")).toContain(
      "review-a · AMBIENT · SIMULATED · 1 response"
    );
    expect(lines.join("\n")).toContain("review-b · SPEND-BLOCKED · REAL");
    expect(lines.join("\n")).toContain("spend ceiling reached");
    expect(lines.join("\n")).toContain("review-c · STALE · REAL");
  });

  it("updates the widget and gives a rewarding verdict reveal", () => {
    const setWidget = vi.fn();
    const setStatus = vi.fn();
    const notify = vi.fn();
    const ui = new ReviewUi({ setStatus, setWidget, notify });

    ui.update({
      agent_next_action: "pass",
      handle: "review-1",
      simulated: true,
      status: "settled"
    });
    ui.reveal({
      agent_next_action: "pass",
      handle: "review-1",
      simulated: true,
      status: "settled"
    });

    expect(setWidget).toHaveBeenCalledWith(
      "vouch-reviews",
      expect.arrayContaining([expect.stringContaining("review-1")]),
      { placement: "aboveEditor" }
    );
    expect(setStatus).toHaveBeenCalledWith(
      "vouch",
      expect.stringContaining("pass")
    );
    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining("SIMULATED"),
      "info"
    );
  });

  it("uses the broker provider mode for manual review confirmation and input", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "vouch-pi-review-command-"));
    execFileSync("git", ["init"], { cwd });
    execFileSync("git", ["config", "user.email", "test@example.test"], {
      cwd
    });
    execFileSync("git", ["config", "user.name", "Test"], { cwd });
    writeFileSync(join(cwd, "work.txt"), "before\n");
    execFileSync("git", ["add", "work.txt"], { cwd });
    execFileSync("git", ["commit", "-m", "initial"], { cwd });
    writeFileSync(join(cwd, "work.txt"), "after\n");

    let commandName: string | undefined;
    let command:
      | {
          handler: (
            args: string,
            ctx: Record<string, unknown>
          ) => Promise<void>;
        }
      | undefined;
    const review = vi.fn().mockResolvedValue({
      handle: "review-live",
      simulated: false,
      status: "ambient"
    });
    registerReviewCommand(
      {
        registerCommand: (
          name: string,
          registered: {
            handler: (
              args: string,
              ctx: Record<string, unknown>
            ) => Promise<void>;
          }
        ) => {
          commandName = name;
          command = registered;
        }
      } as unknown as ExtensionAPI,
      {
        client: { review },
        supervisor: {
          ensureRunning: vi.fn().mockResolvedValue({
            baseUrl: "http://127.0.0.1:31337",
            operatorToken: "token",
            simulated: false
          })
        }
      }
    );
    expect(commandName).toBe("vouch-review");
    const confirm = vi.fn().mockResolvedValue(true);

    await command?.handler("", {
      cwd,
      hasUI: true,
      ui: { confirm, notify: vi.fn() }
    });

    expect(confirm).toHaveBeenCalledWith(
      "Review current diff",
      "Send the uncommitted work product to Vouch's real reviewers?"
    );
    expect(review).toHaveBeenCalledWith(
      expect.objectContaining({ simulated: false })
    );
  });
});
