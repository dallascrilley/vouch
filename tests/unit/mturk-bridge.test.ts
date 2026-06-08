import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildHtmlQuestion,
  loadBridgeState,
  normalizeAssignment,
  parseAnswerXml,
  saveBridgeState,
  summarizeBridgeState
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
            hitId: "hit_123",
            lastDeliveryAt: "2026-06-08T00:02:00.000Z",
            lastPollAt: "2026-06-08T00:02:30.000Z",
            reviewTaskId: "review_123",
            reviewerPool: "managed",
            sanitizedPackageId: "package_123",
            taskTemplate: "Check the staged screenshot."
          }
        }
      });

      expect(loadBridgeState(statePath).tasks.hit_123).toMatchObject({
        callbackAttempts: { assignment_123: 3 },
        deadLetterAssignments: [
          {
            assignmentId: "assignment_123",
            attempts: 3,
            workerId: "worker_123"
          }
        ],
        deliveredAssignmentIds: ["assignment_456"],
        lastDeliveryAt: "2026-06-08T00:02:00.000Z",
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
          hitId: "hit_123",
          lastError: {
            assignmentId: "assignment_123",
            message: "Broker callback failed: 503 unavailable",
            recordedAt: "2026-06-08T00:01:00.000Z"
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
          callbackAttemptedAssignmentCount: 1,
          callbackAttemptTotal: 3,
          deadLetterCount: 1,
          deliveredAssignmentCount: 1,
          hitId: "hit_123",
          lastPollAt: "2026-06-08T00:02:30.000Z",
          reviewTaskId: "review_123"
        }
      ],
      totals: {
        deadLetters: 1,
        deliveredAssignments: 1,
        tasks: 1
      }
    });
  });
});
