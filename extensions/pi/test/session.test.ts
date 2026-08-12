import { describe, expect, it, vi } from "vitest";

import { ReviewHandleRegistry } from "../src/review-client.js";
import { SessionReviewTracker, terminalReview } from "../src/session.js";

describe("SessionReviewTracker", () => {
  it("treats expired ambient handles as terminal", () => {
    expect(
      terminalReview({
        expired: true,
        handle: "review-expired",
        simulated: false,
        status: "ambient"
      })
    ).toBe(true);
  });

  it("surfaces a verdict once and marks content changes stale", async () => {
    const registry = new ReviewHandleRegistry();
    registry.save({
      contentHash: "old-content",
      createdAt: "2026-08-12T00:00:00.000Z",
      envelope: {
        agent_next_action: "pass",
        contentHash: "old-content",
        handle: "review-1",
        simulated: false,
        status: "ambient"
      },
      handle: "review-1",
      idempotencyKey: "key-1",
      jobId: "job-1",
      lastSeenAt: "2026-08-12T00:00:00.000Z",
      reviewTaskId: "task-1"
    });
    const notify = vi.fn();
    const tracker = new SessionReviewTracker({
      client: {
        list: () => registry.list(),
        status: vi.fn().mockResolvedValue({
          agent_next_action: "pass",
          contentHash: "old-content",
          final_verdict: "pass",
          handle: "review-1",
          simulated: false,
          status: "settled"
        })
      },
      currentContentHash: () => "new-content",
      registry,
      supervisor: {
        detach: vi.fn(),
        ensureRunning: vi.fn(),
        isLive: false,
        startBridge: vi.fn()
      }
    });

    await tracker.reconcile({
      brokerBaseUrl: "http://broker.test",
      notify,
      operatorToken: "token"
    });
    await tracker.reconcile({
      brokerBaseUrl: "http://broker.test",
      notify,
      operatorToken: "token"
    });

    expect(notify).toHaveBeenCalledOnce();
    expect(notify.mock.calls[0]?.[0]).toContain("stale");
    expect(registry.list()[0]?.surfacedAt).toBeTruthy();
    expect(registry.list()[0]?.envelope).toMatchObject({
      final_verdict: "pass",
      stale: true,
      status: "settled"
    });
  });
});
