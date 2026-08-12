import { describe, expect, it, vi } from "vitest";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerReviewTools } from "../src/tools.js";

describe("Pi review tools", () => {
  it("registers one workflow tool and two read primitives", async () => {
    const tools: Array<Record<string, unknown>> = [];
    const pi = {
      registerTool: (tool: Record<string, unknown>) => tools.push(tool)
    };
    const review = vi.fn().mockResolvedValue({
      handle: "review-1",
      simulated: true,
      status: "settled"
    });
    const status = vi.fn().mockResolvedValue({
      handle: "review-1",
      simulated: true,
      status: "settled"
    });
    const list = vi.fn().mockReturnValue([]);
    const ensureRunning = vi.fn().mockResolvedValue({
      baseUrl: "http://127.0.0.1:31337",
      operatorToken: "token",
      simulated: true
    });

    registerReviewTools(pi as unknown as ExtensionAPI, {
      client: { list, review, status },
      supervisor: { ensureRunning, isLive: false, startBridge: vi.fn() }
    });

    expect(tools.map((tool) => tool.name)).toEqual([
      "human_review",
      "review_status",
      "list_pending_reviews"
    ]);
    const execute = tools[0]?.execute as (
      toolCallId: string,
      params: Record<string, unknown>,
      signal: undefined,
      onUpdate: undefined,
      ctx: Record<string, unknown>
    ) => Promise<unknown>;
    const result = await execute(
      "call-1",
      {
        criteria: [{ criterion_id: "hero", statement: "The hero is visible." }],
        text: "The hero is visible.",
        force_new: true,
        template_id: "text_quality_rubric"
      },
      undefined,
      undefined,
      { ui: { notify: vi.fn() } }
    );
    expect(review).toHaveBeenCalledWith(
      expect.objectContaining({
        brokerBaseUrl: "http://127.0.0.1:31337",
        agentControlled: true,
        dataClass: "internal_low",
        forceNew: true,
        operatorToken: "token",
        simulated: true
      })
    );
    expect(result).toMatchObject({ details: { status: "settled" } });

    list.mockReturnValue(
      Array.from({ length: 25 }, (_, index) => ({
        contentHash: `hash-${index}`,
        createdAt: "2026-08-12T00:00:00.000Z",
        envelope: {
          handle: `review-${index}`,
          simulated: true,
          status: "ambient"
        },
        handle: `review-${index}`,
        idempotencyKey: `key-${index}`,
        jobId: `job-${index}`,
        lastSeenAt: "2026-08-12T00:00:00.000Z",
        reviewTaskId: `task-${index}`
      }))
    );
    const listPending = tools[2]?.execute as () => Promise<{
      details: unknown[];
    }>;
    const pending = await listPending();
    expect(pending.details).toHaveLength(25);
    expect(status).toHaveBeenCalledTimes(25);
  });
});
