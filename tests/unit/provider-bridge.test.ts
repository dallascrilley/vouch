import { describe, expect, it, vi } from "vitest";

import {
  deliverProviderCallback,
  isThrottlingErrorMessage,
  nextPollBackoffMs,
  type BridgeTaskRecord
} from "../../scripts/lib/provider-bridge.js";

describe("provider bridge common helpers", () => {
  it("delivers a mock second-provider callback using the shared retry and receipt state", async () => {
    const task = makeTask();
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(JSON.stringify({ accepted: true }), {
          status: 202
        })
      )
    );
    const save = vi.fn();

    const result = await deliverProviderCallback({
      brokerCallbackUrl: "http://broker.test/provider-callback",
      fetchImpl,
      maxCallbackAttempts: 3,
      now: () => new Date("2026-06-08T05:00:00.000Z"),
      payload: mockCallbackPayload(),
      responseId: "mock_response_123",
      save,
      sharedSecret: "shared-secret",
      task,
      workerId: "mock_worker_123"
    });

    expect(result).toEqual({ attempts: 1, delivered: true });
    expect(task.deliveredAssignmentIds).toEqual(["mock_response_123"]);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("detects AWS throttling error messages", () => {
    expect(
      isThrottlingErrorMessage(
        "ThrottlingException on list-assignments-for-hit"
      )
    ).toBe(true);
    expect(isThrottlingErrorMessage("connection reset")).toBe(false);
  });

  it("doubles poll backoff until the configured ceiling", () => {
    expect(
      nextPollBackoffMs({
        pollIntervalMs: 15_000,
        maxPollBackoffMs: 300_000
      })
    ).toBe(30_000);
    expect(
      nextPollBackoffMs({
        currentBackoffMs: 200_000,
        pollIntervalMs: 15_000,
        maxPollBackoffMs: 300_000
      })
    ).toBe(300_000);
  });

  it("marks delivery complete and records delivery lag once all expected assignments are delivered", async () => {
    const task = makeTask();
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(JSON.stringify({ accepted: true }), { status: 202 })
      )
    );

    const result = await deliverProviderCallback({
      brokerCallbackUrl: "http://broker.test/provider-callback",
      expectedAssignmentCount: 1,
      fetchImpl,
      maxCallbackAttempts: 3,
      now: () => new Date("2026-06-08T05:00:10.000Z"),
      payload: mockCallbackPayload(),
      responseId: "mock_response_123",
      save: vi.fn(),
      sharedSecret: "shared-secret",
      submittedAt: new Date("2026-06-08T05:00:00.000Z"),
      task,
      workerId: "mock_worker_123"
    });

    expect(result).toEqual({ attempts: 1, delivered: true });
    expect(task.deliveryComplete).toBe(true);
    expect(task.deliveryCompletedAt).toBe("2026-06-08T05:00:10.000Z");
    expect(task.lastDeliveryLagMs).toBe(10_000);
  });

  it("leaves delivery incomplete while assignments are still expected", async () => {
    const task = makeTask();
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(JSON.stringify({ accepted: true }), { status: 202 })
      )
    );

    await deliverProviderCallback({
      brokerCallbackUrl: "http://broker.test/provider-callback",
      expectedAssignmentCount: 2,
      fetchImpl,
      maxCallbackAttempts: 3,
      now: () => new Date("2026-06-08T05:00:10.000Z"),
      payload: mockCallbackPayload(),
      responseId: "mock_response_123",
      save: vi.fn(),
      sharedSecret: "shared-secret",
      task,
      workerId: "mock_worker_123"
    });

    expect(task.deliveryComplete).toBeUndefined();
    expect(task.deliveryCompletedAt).toBeUndefined();
  });

  it("dead-letters a provider response when broker callback retries are exhausted", async () => {
    const task = makeTask();
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response("unavailable", { status: 503 }))
    );
    const save = vi.fn();

    const first = await deliverProviderCallback({
      brokerCallbackUrl: "http://broker.test/provider-callback",
      fetchImpl,
      maxCallbackAttempts: 2,
      now: () => new Date("2026-06-08T05:01:00.000Z"),
      payload: mockCallbackPayload(),
      responseId: "mock_response_123",
      save,
      sharedSecret: "shared-secret",
      task,
      workerId: "mock_worker_123"
    });
    const second = await deliverProviderCallback({
      brokerCallbackUrl: "http://broker.test/provider-callback",
      fetchImpl,
      maxCallbackAttempts: 2,
      now: () => new Date("2026-06-08T05:02:00.000Z"),
      payload: mockCallbackPayload(),
      responseId: "mock_response_123",
      save,
      sharedSecret: "shared-secret",
      task,
      workerId: "mock_worker_123"
    });

    expect(first).toMatchObject({
      attempts: 1,
      deadLettered: false,
      delivered: false
    });
    expect(second).toMatchObject({
      attempts: 2,
      deadLettered: true,
      delivered: false
    });
    expect(task.callbackAttempts).toEqual({ mock_response_123: 2 });
    expect(task.deliveredAssignmentIds).toEqual([]);
    expect(task.deadLetterAssignments).toEqual([
      {
        assignmentId: "mock_response_123",
        attempts: 2,
        reason: "Broker callback failed: 503 unavailable",
        recordedAt: "2026-06-08T05:02:00.000Z",
        workerId: "mock_worker_123"
      }
    ]);
    expect(task.lastError).toMatchObject({
      assignmentId: "mock_response_123",
      message: "Broker callback failed: 503 unavailable"
    });
  });
});

function makeTask(): BridgeTaskRecord {
  return {
    approvedAssignmentIds: [],
    callbackAttempts: {},
    createdAt: "2026-06-08T04:00:00.000Z",
    criterionIds: ["modal-focus-visible"],
    deadLetterAssignments: [],
    deliveredAssignmentIds: [],
    hitId: "mock_task_123",
    reviewTaskId: "review_mock_123",
    reviewerPool: "managed",
    sanitizedPackageId: "package_mock_123",
    taskTemplate: "Review the supplied evidence."
  };
}

function mockCallbackPayload() {
  return {
    provider_id: "mock-second-provider",
    provider_task_id: "mock_task_123",
    provider_response_id: "mock_response_123",
    reviewer_pseudonymous_id: "mock_worker_123",
    overall_verdict: "unclear" as const,
    criterion_results: [
      {
        criterion_id: "modal-focus-visible",
        status: "unclear" as const,
        confidence: "medium" as const
      }
    ],
    defect_category: "focus_visibility",
    evidence_note: "The supplied artifact is ambiguous.",
    severity: "S2" as const
  };
}
