import { describe, expect, it } from "vitest";

import { buildHtmlQuestion, normalizeAssignment, parseAnswerXml } from "../../scripts/lib/mturk-bridge.js";

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
});
