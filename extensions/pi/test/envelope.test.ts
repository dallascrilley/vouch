import { describe, expect, it, vi } from "vitest";

import { requestHumanReview } from "../../../scripts/lib/agent-review-client.js";

import {
  BrokerHttpError,
  PiReviewClient,
  ReviewHandleRegistry,
  buildIdempotencyKey,
  mapReviewError,
  mapReviewResult
} from "../src/review-client.js";

describe("Pi review envelope", () => {
  it("maps simulator feedback to a settled simulated envelope", () => {
    const envelope = mapReviewResult(
      {
        feedback: {
          agent_next_action: "pass",
          evidence_pointers: [],
          failed_criteria: [],
          final_verdict: "pass",
          human_annotations: [],
          policy_constraints: [],
          provider_ids: ["local-provider-simulator"],
          provider_response_ids: [],
          retry_allowed: false
        },
        jobId: "job-1",
        reviewTaskId: "task-1",
        timedOut: false
      },
      {
        contentHash: "content-1",
        handle: "review-handle-1",
        idempotencyKey: "key-1"
      }
    );

    expect(envelope).toMatchObject({
      agent_next_action: "pass",
      handle: "review-handle-1",
      simulated: true,
      status: "settled"
    });
  });

  it("maps real feedback to a non-simulated settled envelope", () => {
    const envelope = mapReviewResult(
      {
        feedback: {
          agent_next_action: "fail",
          evidence_pointers: [],
          failed_criteria: ["hero"],
          final_verdict: "fail",
          human_annotations: [],
          policy_constraints: [],
          provider_ids: ["real-provider"],
          provider_response_ids: [],
          retry_allowed: true
        },
        jobId: "job-1",
        reviewTaskId: "task-1",
        timedOut: false
      },
      {
        contentHash: "content-1",
        handle: "review-handle-1",
        idempotencyKey: "key-1"
      }
    );

    expect(envelope).toMatchObject({ simulated: false, status: "settled" });
  });

  it("maps a grace-window timeout to an ambient envelope", () => {
    const envelope = mapReviewResult(
      {
        jobId: "job-1",
        reviewTaskId: "task-1",
        stuckState: { stuck: true, stuck_reason: "awaiting_reviewers" },
        timedOut: true
      },
      {
        contentHash: "content-1",
        handle: "review-handle-1",
        idempotencyKey: "key-1",
        simulated: false
      }
    );

    expect(envelope).toMatchObject({
      handle: "review-handle-1",
      simulated: false,
      status: "ambient",
      stuckState: { stuck: true }
    });
  });

  it("maps a dispatch privacy block to not_reviewed", () => {
    const envelope = mapReviewError(
      new BrokerHttpError(
        "http://broker.test/verification-jobs/job-1/human-review-tasks",
        403,
        { message: "regulated or secret data requires internal review" }
      ),
      {
        contentHash: "content-1",
        simulated: true,
        idempotencyKey: "key-1"
      }
    );

    expect(envelope).toMatchObject({
      blockingReasons: ["regulated or secret data requires internal review"],
      simulated: true,
      status: "not_reviewed"
    });
  });

  it("deduplicates unchanged review inputs before dispatch", async () => {
    const request = vi.fn().mockResolvedValue({
      feedback: {
        agent_next_action: "pass",
        evidence_pointers: [],
        failed_criteria: [],
        final_verdict: "pass",
        human_annotations: [],
        policy_constraints: [],
        provider_ids: ["local-provider-simulator"],
        provider_response_ids: [],
        retry_allowed: false
      },
      jobId: "job-1",
      reviewTaskId: "task-1",
      timedOut: false
    });
    const client = new PiReviewClient({
      brokerBaseUrl: "http://broker.test",
      registry: new ReviewHandleRegistry(),
      requestHumanReview: request
    });
    const input = {
      criteria: [
        { criterionId: "hero", humanVisibleText: "The hero is visible." }
      ],
      contentHash: "artifact-hash",
      reviewerPool: "managed",
      simulated: true,
      templateId: "binary_screenshot_check"
    };

    await client.review(input);
    await client.review(input);

    expect(buildIdempotencyKey(input)).toBe(buildIdempotencyKey(input));
    expect(request).toHaveBeenCalledOnce();
  });

  it("records an ambient handle when the feedback wait is aborted", async () => {
    const controller = new AbortController();
    const fetchImpl: typeof fetch = vi.fn((input) => {
      const url = String(input);
      if (url.endsWith("/verification-jobs")) {
        return Promise.resolve(
          new Response(JSON.stringify({ job_id: "job-aborted" }), {
            status: 202
          })
        );
      }
      if (url.endsWith("/human-review-tasks")) {
        return Promise.resolve(
          new Response(JSON.stringify({ review_task_id: "task-aborted" }), {
            status: 202
          })
        );
      }
      if (url.endsWith("/feedback")) {
        controller.abort();
        return Promise.reject(new DOMException("Aborted", "AbortError"));
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 202 }));
    });

    const result = await requestHumanReview({
      brokerBaseUrl: "http://broker.test",
      criteria: [
        { criterionId: "hero", humanVisibleText: "The hero is visible." }
      ],
      fetchImpl,
      signal: controller.signal,
      template: "review text",
      timeoutMs: 1_000
    });

    expect(result).toMatchObject({
      jobId: "job-aborted",
      reviewTaskId: "task-aborted",
      stuckState: { aborted: true },
      timedOut: true
    });
  });

  it("merges registry writes from concurrent Pi sessions", () => {
    const filePath = join(
      mkdtempSync(join(tmpdir(), "vouch-registry-")),
      "handles.json"
    );
    const first = new ReviewHandleRegistry(filePath);
    const second = new ReviewHandleRegistry(filePath);
    const record = (idempotencyKey: string) => ({
      contentHash: idempotencyKey,
      createdAt: `2026-08-12T00:00:0${idempotencyKey.endsWith("1") ? "1" : "2"}.000Z`,
      handle: `handle-${idempotencyKey}`,
      idempotencyKey,
      jobId: `job-${idempotencyKey}`,
      lastSeenAt: "2026-08-12T00:00:00.000Z",
      reviewTaskId: `task-${idempotencyKey}`
    });

    first.save(record("key-1"));
    second.save(record("key-2"));

    expect(new ReviewHandleRegistry(filePath).list()).toHaveLength(2);
  });
});
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
