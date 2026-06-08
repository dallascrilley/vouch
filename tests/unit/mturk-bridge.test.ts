import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildHtmlQuestion,
  loadBridgeState,
  normalizeAssignment,
  parseAssignmentApprovalPolicy,
  parseAnswerXml,
  saveBridgeState,
  summarizeBridgeState,
  validateBridgeSafety
} from "../../scripts/lib/mturk-bridge.js";

describe("mturk bridge helpers", () => {
  it("builds an HTMLQuestion payload for the sandbox", () => {
    const question = buildHtmlQuestion({
      criterionIds: ["desktop-layout"],
      reviewTaskId: "review_123",
      sandbox: true,
      taskTemplate: "Check the staged screenshot."
    });

    expect(question).toContain("<HTMLQuestion");
    expect(question).toContain("workersandbox.mturk.com/mturk/externalSubmit");
    expect(question).toContain("desktop-layout");
  });

  it("parses MTurk answer xml into broker callback shape", () => {
    const answerXml = `
      <QuestionFormAnswers>
        <Answer><QuestionIdentifier>overall_verdict</QuestionIdentifier><FreeText>fail</FreeText></Answer>
        <Answer><QuestionIdentifier>severity</QuestionIdentifier><FreeText>S2</FreeText></Answer>
        <Answer><QuestionIdentifier>defect_category</QuestionIdentifier><FreeText>layout</FreeText></Answer>
        <Answer><QuestionIdentifier>evidence_note</QuestionIdentifier><FreeText>CTA overlaps headline</FreeText></Answer>
        <Answer><QuestionIdentifier>quality_flags</QuestionIdentifier><FreeText>blurred,needs_followup</FreeText></Answer>
        <Answer><QuestionIdentifier>criterion_0_status</QuestionIdentifier><FreeText>fail</FreeText></Answer>
        <Answer><QuestionIdentifier>criterion_0_confidence</QuestionIdentifier><FreeText>high</FreeText></Answer>
      </QuestionFormAnswers>
    `;

    const fields = parseAnswerXml(answerXml);
    expect(fields.get("overall_verdict")).toBe("fail");

    const normalized = normalizeAssignment({
      answerXml,
      assignmentId: "assignment_123",
      criterionIds: ["desktop-layout"],
      providerId: "real-provider",
      providerTaskId: "hit_123",
      workerId: "worker_123"
    });

    expect(normalized).toMatchObject({
      overall_verdict: "fail",
      provider_response_id: "assignment_123",
      provider_task_id: "hit_123",
      reviewer_pseudonymous_id: "worker_123",
      severity: "S2"
    });
    expect(normalized.criterion_results).toEqual([
      {
        confidence: "high",
        criterion_id: "desktop-layout",
        status: "fail"
      }
    ]);
    expect(normalized.quality_flags).toEqual(["blurred", "needs_followup"]);
  });

  it("persists operational delivery metadata for restart recovery", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "mturk-bridge-state-"));
    const statePath = join(tempDir, "state.json");

    try {
      saveBridgeState(statePath, {
        tasks: {
          hit_123: {
            approvedAssignmentIds: ["assignment_456"],
            callbackAttempts: { assignment_123: 3 },
            createdAt: "2026-06-08T00:00:00.000Z",
            criterionIds: ["desktop-layout"],
            deadLetterAssignments: [
              {
                assignmentId: "assignment_123",
                attempts: 3,
                reason: "Broker callback failed: 503 unavailable",
                recordedAt: "2026-06-08T00:01:00.000Z",
                workerId: "worker_123"
              }
            ],
            deliveredAssignmentIds: ["assignment_456"],
            expiredAt: "2026-06-08T00:03:00.000Z",
            hitId: "hit_123",
            hitExpirationAt: "2026-06-08T00:02:59.000Z",
            hitReviewStatus: "NotReviewed",
            hitStatus: "Reviewable",
            lastApprovalAt: "2026-06-08T00:02:10.000Z",
            lastDeliveryAt: "2026-06-08T00:02:00.000Z",
            lastHitStatusAt: "2026-06-08T00:03:00.000Z",
            lastPollAt: "2026-06-08T00:02:30.000Z",
            reviewTaskId: "review_123",
            reviewerPool: "managed",
            sanitizedPackageId: "package_123",
            taskTemplate: "Check the staged screenshot."
          }
        }
      });

      expect(loadBridgeState(statePath).tasks.hit_123).toMatchObject({
        approvedAssignmentIds: ["assignment_456"],
        callbackAttempts: { assignment_123: 3 },
        deadLetterAssignments: [
          {
            assignmentId: "assignment_123",
            attempts: 3,
            workerId: "worker_123"
          }
        ],
        deliveredAssignmentIds: ["assignment_456"],
        expiredAt: "2026-06-08T00:03:00.000Z",
        hitExpirationAt: "2026-06-08T00:02:59.000Z",
        hitReviewStatus: "NotReviewed",
        hitStatus: "Reviewable",
        lastApprovalAt: "2026-06-08T00:02:10.000Z",
        lastDeliveryAt: "2026-06-08T00:02:00.000Z",
        lastHitStatusAt: "2026-06-08T00:03:00.000Z",
        lastPollAt: "2026-06-08T00:02:30.000Z"
      });
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it("summarizes task health and dead letters for operator inspection", () => {
    const summary = summarizeBridgeState({
      tasks: {
        hit_123: {
          approvedAssignmentIds: ["assignment_456"],
          callbackAttempts: { assignment_123: 3 },
          createdAt: "2026-06-08T00:00:00.000Z",
          criterionIds: ["desktop-layout"],
          deadLetterAssignments: [
            {
              assignmentId: "assignment_123",
              attempts: 3,
              reason: "Broker callback failed: 503 unavailable",
              recordedAt: "2026-06-08T00:01:00.000Z",
              workerId: "worker_123"
            }
          ],
          deliveredAssignmentIds: ["assignment_456"],
          expiredAt: "2026-06-08T00:03:00.000Z",
          hitId: "hit_123",
          hitExpirationAt: "2026-06-08T00:02:59.000Z",
          hitReviewStatus: "NotReviewed",
          hitStatus: "Reviewable",
          lastApprovalAt: "2026-06-08T00:02:10.000Z",
          lastApprovalError: {
            assignmentId: "assignment_789",
            message: "approval failed",
            recordedAt: "2026-06-08T00:02:20.000Z"
          },
          lastError: {
            assignmentId: "assignment_123",
            message: "Broker callback failed: 503 unavailable",
            recordedAt: "2026-06-08T00:01:00.000Z"
          },
          lastHitStatusAt: "2026-06-08T00:03:00.000Z",
          lastHitStatusError: {
            message: "get-hit throttled",
            recordedAt: "2026-06-08T00:03:30.000Z"
          },
          lastPollAt: "2026-06-08T00:02:30.000Z",
          reviewTaskId: "review_123",
          reviewerPool: "managed",
          sanitizedPackageId: "package_123",
          taskTemplate: "Check the staged screenshot."
        }
      }
    });

    expect(summary).toMatchObject({
      deadLetters: [
        {
          assignmentId: "assignment_123",
          attempts: 3,
          hitId: "hit_123",
          reviewTaskId: "review_123",
          workerId: "worker_123"
        }
      ],
      tasks: [
        {
          approvedAssignmentCount: 1,
          callbackAttemptedAssignmentCount: 1,
          callbackAttemptTotal: 3,
          deadLetterCount: 1,
          deliveredAssignmentCount: 1,
          expiredAt: "2026-06-08T00:03:00.000Z",
          hitId: "hit_123",
          hitExpirationAt: "2026-06-08T00:02:59.000Z",
          hitReviewStatus: "NotReviewed",
          hitStatus: "Reviewable",
          lastApprovalAt: "2026-06-08T00:02:10.000Z",
          lastApprovalError: {
            assignmentId: "assignment_789",
            message: "approval failed"
          },
          lastHitStatusAt: "2026-06-08T00:03:00.000Z",
          lastHitStatusError: {
            message: "get-hit throttled"
          },
          lastPollAt: "2026-06-08T00:02:30.000Z",
          reviewTaskId: "review_123"
        }
      ],
      totals: {
        approvedAssignments: 1,
        deadLetters: 1,
        deliveredAssignments: 1,
        expiredTasks: 1,
        tasks: 1
      }
    });
  });

  it("parses the assignment approval policy", () => {
    expect(parseAssignmentApprovalPolicy(undefined)).toBe("manual");
    expect(parseAssignmentApprovalPolicy("manual")).toBe("manual");
    expect(parseAssignmentApprovalPolicy("approve_on_callback_success")).toBe("approve_on_callback_success");
    expect(() => parseAssignmentApprovalPolicy("always")).toThrow(
      'MTURK_ASSIGNMENT_APPROVAL_POLICY must be "manual" or "approve_on_callback_success"'
    );
  });

  it("accepts bounded MTurk safety settings", () => {
    expect(
      validateBridgeSafety({
        autoApprovalDelaySeconds: 259200,
        expirationSeconds: 86400,
        maxAssignments: 1,
        maxAssignmentsPerHit: 3,
        maxRewardUsd: 1,
        maxSpendPerHitUsd: 3,
        minAutoApprovalDelaySeconds: 86400,
        minExpirationSeconds: 300,
        minTaskDurationSeconds: 60,
        reward: "0.05",
        taskDurationSeconds: 900
      })
    ).toEqual([]);
  });

  it("rejects unsafe MTurk spend and timing settings", () => {
    expect(
      validateBridgeSafety({
        autoApprovalDelaySeconds: 60,
        expirationSeconds: 120,
        maxAssignments: 5,
        maxAssignmentsPerHit: 3,
        maxRewardUsd: 1,
        maxSpendPerHitUsd: 3,
        minAutoApprovalDelaySeconds: 86400,
        minExpirationSeconds: 300,
        minTaskDurationSeconds: 60,
        reward: "2.00",
        taskDurationSeconds: 30
      })
    ).toEqual([
      "MTURK_MAX_ASSIGNMENTS 5 exceeds MTURK_MAX_ASSIGNMENTS_PER_HIT 3",
      "MTURK_REWARD 2.00 exceeds MTURK_MAX_REWARD_USD 1",
      "Per-HIT spend 10.00 exceeds MTURK_MAX_SPEND_PER_HIT_USD 3",
      "MTURK_TASK_DURATION_SECONDS 30 is below MTURK_MIN_TASK_DURATION_SECONDS 60",
      "MTURK_EXPIRATION_SECONDS 120 is below MTURK_MIN_EXPIRATION_SECONDS 300",
      "MTURK_AUTO_APPROVAL_DELAY_SECONDS 60 is below MTURK_MIN_AUTO_APPROVAL_DELAY_SECONDS 86400"
    ]);
  });

  it("rejects malformed MTurk safety limits", () => {
    expect(
      validateBridgeSafety({
        autoApprovalDelaySeconds: 259200,
        expirationSeconds: 86400,
        maxAssignments: 1,
        maxAssignmentsPerHit: Number.NaN,
        maxRewardUsd: 0,
        maxSpendPerHitUsd: Number.NaN,
        minAutoApprovalDelaySeconds: Number.NaN,
        minExpirationSeconds: 0,
        minTaskDurationSeconds: Number.NaN,
        reward: "0.05",
        taskDurationSeconds: 900
      })
    ).toEqual([
      "MTURK_MAX_ASSIGNMENTS_PER_HIT must be a positive number",
      "MTURK_MAX_REWARD_USD must be a positive number",
      "MTURK_MAX_SPEND_PER_HIT_USD must be a positive number",
      "MTURK_MIN_TASK_DURATION_SECONDS must be a positive number",
      "MTURK_MIN_EXPIRATION_SECONDS must be a positive number",
      "MTURK_MIN_AUTO_APPROVAL_DELAY_SECONDS must be a positive number"
    ]);
  });
});
