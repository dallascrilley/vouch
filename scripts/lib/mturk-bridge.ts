import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type BridgeDispatchBody = {
  callback_url?: string;
  criterion_ids: string[];
  review_task_id: string;
  reviewer_pool: string;
  sanitized_package_id: string;
  task_template: string;
};

export type BridgeTaskRecord = {
  createdAt: string;
  criterionIds: string[];
  deliveredAssignmentIds: string[];
  hitId: string;
  reviewTaskId: string;
  reviewerPool: string;
  sanitizedPackageId: string;
  taskTemplate: string;
};

export type BridgeState = {
  tasks: Record<string, BridgeTaskRecord>;
};

export const emptyBridgeState = (): BridgeState => ({ tasks: {} });

export function loadBridgeState(path: string): BridgeState {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<BridgeState>;
    return {
      tasks: parsed.tasks ?? {}
    };
  } catch {
    return emptyBridgeState();
  }
}

export function saveBridgeState(path: string, state: BridgeState) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2));
}

export function buildHtmlQuestion(input: {
  criterionIds: string[];
  reviewTaskId: string;
  sandbox: boolean;
  taskTemplate: string;
}) {
  const submitBase = input.sandbox ? "https://workersandbox.mturk.com" : "https://www.mturk.com";
  const criteriaMarkup = input.criterionIds
    .map(
      (criterionId, index) => `
        <fieldset class="criterion">
          <legend>Criterion ${index + 1}: ${escapeHtml(criterionId)}</legend>
          ${radioGroup(`criterion_${index}_status`, ["pass", "fail", "unclear", "not_visible"])}
          <label>
            Confidence
            <select name="criterion_${index}_confidence" required>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
          </label>
        </fieldset>
      `
    )
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Human Review Task</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 24px; line-height: 1.4; }
      fieldset { margin-bottom: 16px; }
      textarea { width: 100%; min-height: 120px; }
      .hint { color: #555; margin-bottom: 16px; }
      .criterion label, .stack label { display: block; margin: 8px 0; }
    </style>
    <script type="text/javascript" src="https://s3.amazonaws.com/mturk-public/externalHIT_v1.js"></script>
  </head>
  <body>
    <h1>Observable UI Verification Review</h1>
    <p class="hint">Review task ${escapeHtml(input.reviewTaskId)}. Evaluate only observable UI evidence.</p>
    <p>${escapeHtml(input.taskTemplate)}</p>
    <form name="mturk_form" method="post" id="mturk_form" action="${submitBase}/mturk/externalSubmit">
      <input type="hidden" id="assignmentId" name="assignmentId" value="" />

      <fieldset class="stack">
        <legend>Overall verdict</legend>
        ${radioGroup("overall_verdict", ["pass", "fail", "unclear", "artifact_insufficient"])}
      </fieldset>

      <fieldset class="stack">
        <legend>Severity</legend>
        ${radioGroup("severity", ["S0", "S1", "S2", "S3", "S4"])}
      </fieldset>

      <label>
        Defect category
        <input type="text" name="defect_category" required />
      </label>

      ${criteriaMarkup}

      <label>
        Evidence note
        <textarea name="evidence_note" required></textarea>
      </label>

      <label>
        Quality flags
        <input type="text" name="quality_flags" placeholder="comma,separated,optional" />
      </label>

      <button type="submit">Submit review</button>
    </form>
    <script>
      const url = new URL(window.location.href);
      const assignmentId = url.searchParams.get("assignmentId") || "";
      const submitTo = url.searchParams.get("turkSubmitTo") || "${submitBase}";
      document.getElementById("assignmentId").value = assignmentId;
      document.getElementById("mturk_form").action = submitTo.replace(/\\/$/, "") + "/mturk/externalSubmit";
      if (assignmentId === "ASSIGNMENT_ID_NOT_AVAILABLE") {
        const button = document.querySelector("button");
        if (button) button.disabled = true;
      }
    </script>
  </body>
</html>`;

  return `
<HTMLQuestion xmlns="http://mechanicalturk.amazonaws.com/AWSMechanicalTurkDataSchemas/2011-11-11/HTMLQuestion.xsd">
  <HTMLContent><![CDATA[${html}]]></HTMLContent>
  <FrameHeight>0</FrameHeight>
</HTMLQuestion>`.trim();
}

export function parseAnswerXml(answerXml: string) {
  const answers = [...answerXml.matchAll(/<Answer>([\s\S]*?)<\/Answer>/g)];
  const fields = new Map<string, string>();

  for (const [, answerBlock] of answers) {
    const identifier = answerBlock.match(/<QuestionIdentifier>([\s\S]*?)<\/QuestionIdentifier>/)?.[1]?.trim();
    const freeText = answerBlock.match(/<FreeText>([\s\S]*?)<\/FreeText>/)?.[1]?.trim() ?? "";
    if (identifier) {
      fields.set(identifier, decodeXml(freeText));
    }
  }

  return fields;
}

export function normalizeAssignment(input: {
  answerXml: string;
  assignmentId: string;
  criterionIds: string[];
  providerId: string;
  providerTaskId: string;
  workerId: string;
}) {
  const fields = parseAnswerXml(input.answerXml);

  return {
    criterion_results: input.criterionIds.map((criterionId, index) => ({
      criterion_id: criterionId,
      confidence: (fields.get(`criterion_${index}_confidence`) ?? "medium") as "low" | "medium" | "high",
      status: (fields.get(`criterion_${index}_status`) ?? "unclear") as
        | "pass"
        | "fail"
        | "unclear"
        | "not_visible"
    })),
    defect_category: fields.get("defect_category") ?? "unspecified",
    delivery_mode: "polling" as const,
    evidence_note: fields.get("evidence_note") ?? "No reviewer note provided.",
    overall_verdict: (fields.get("overall_verdict") ?? "unclear") as
      | "pass"
      | "fail"
      | "unclear"
      | "artifact_insufficient",
    provider_assignment_ref: input.assignmentId,
    provider_id: input.providerId,
    provider_response_id: input.assignmentId,
    provider_task_id: input.providerTaskId,
    quality_flags: splitCsv(fields.get("quality_flags") ?? ""),
    reviewer_pseudonymous_id: input.workerId,
    severity: (fields.get("severity") ?? "S3") as "S0" | "S1" | "S2" | "S3" | "S4"
  };
}

function splitCsv(value: string) {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function radioGroup(name: string, values: string[]) {
  return values
    .map(
      (value) => `
        <label>
          <input type="radio" name="${name}" value="${value}" required />
          ${value}
        </label>
      `
    )
    .join("\n");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function decodeXml(value: string) {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&");
}
