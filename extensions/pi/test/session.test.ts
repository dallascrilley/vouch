import { describe, expect, it, vi } from "vitest";

import { ReviewHandleRegistry } from "../src/review-client.js";
import {
  SessionReviewTracker,
  terminalRecord,
  terminalReview
} from "../src/session.js";

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

  it("treats deadline-elapsed ambient records as terminal before expiry is persisted", () => {
    expect(
      terminalRecord({
        contentHash: "hash",
        createdAt: "2026-08-12T00:00:00.000Z",
        deadlineAt: "2026-08-12T00:00:00.000Z",
        envelope: {
          handle: "review-deadline",
          simulated: false,
          status: "ambient"
        },
        handle: "review-deadline",
        idempotencyKey: "key-deadline",
        jobId: "job-deadline",
        lastSeenAt: "2026-08-12T00:00:00.000Z",
        reviewTaskId: "task-deadline"
      })
    ).toBe(true);
  });

  it("marks deadline-elapsed ambient reviews not_reviewed without broker recovery", async () => {
    const registry = new ReviewHandleRegistry();
    registry.save({
      contentHash: "hash",
      createdAt: "2026-08-12T00:00:00.000Z",
      deadlineAt: "2026-08-12T00:00:00.000Z",
      envelope: {
        handle: "review-expired",
        simulated: false,
        status: "ambient"
      },
      handle: "review-expired",
      idempotencyKey: "key-expired",
      jobId: "job-expired",
      lastSeenAt: "2026-08-12T00:00:00.000Z",
      reviewTaskId: "task-expired"
    });
    const status = vi.fn();
    const ensureRunning = vi.fn();
    const tracker = new SessionReviewTracker({
      client: {
        list: () => registry.list(),
        status
      },
      registry,
      supervisor: {
        detach: vi.fn(),
        ensureRunning,
        isLive: false,
        startBridge: vi.fn()
      }
    });

    await tracker.onSessionStart({
      ui: { notify: vi.fn() }
    } as never);

    expect(ensureRunning).not.toHaveBeenCalled();
    expect(status).not.toHaveBeenCalled();
    expect(registry.list()[0]?.envelope).toMatchObject({
      expired: true,
      status: "not_reviewed"
    });
    expect(registry.list()[0]?.surfacedAt).toBeTruthy();
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
