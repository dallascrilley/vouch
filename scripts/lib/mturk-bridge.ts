export {
  emptyBridgeState,
  loadBridgeState,
  mergeSaveBridgeState,
  saveBridgeState,
  summarizeBridgeState
} from "./provider-bridge.js";
import type { BridgeVisualEvidence } from "./provider-bridge.js";
import {
  normalizeStructuredAnswers,
  parseTaskTemplate,
  renderStructuredFormBody,
  type TemplatePricing
} from "./review-templates.js";
export type {
  BridgeDeadLetterAssignment,
  BridgeDispatchBody,
  BridgeState,
  BridgeStateSummary,
  BridgeTaskError,
  BridgeTaskRecord
} from "./provider-bridge.js";

export type BridgeAssignmentApprovalPolicy =
  | "manual"
  | "approve_on_callback_success";

export type MturkQualificationRequirement = {
  QualificationTypeId: string;
  Comparator: string;
  ActionsGuarded?: string;
  IntegerValues?: number[];
  LocaleValues?: Array<{
    Country?: string;
    Subdivision?: string;
  }>;
  RequiredToPreview?: boolean;
};

export type BridgeSafetyConfig = {
  maxAssignments: number;
  maxAssignmentsPerHit: number;
  maxRewardUsd: number;
  maxSpendPerHitUsd: number;
  minAutoApprovalDelaySeconds: number;
  minExpirationSeconds: number;
  minTaskDurationSeconds: number;
  reward: string;
  autoApprovalDelaySeconds: number;
  expirationSeconds: number;
  taskDurationSeconds: number;
};

export function parseAssignmentApprovalPolicy(
  value: string | undefined
): BridgeAssignmentApprovalPolicy {
  if (!value || value === "manual") {
    return "manual";
  }
  if (value === "approve_on_callback_success") {
    return value;
  }
  throw new Error(
    `MTURK_ASSIGNMENT_APPROVAL_POLICY must be "manual" or "approve_on_callback_success", received "${value}"`
  );
}

export function normalizeMturkTimestamp(value: number | string | undefined) {
  if (typeof value === "number") {
    const date = new Date(value * 1000);
    return Number.isFinite(date.getTime()) ? date : undefined;
  }
  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : undefined;
  }
  return undefined;
}

export function parseQualificationRequirements(
  value: string | undefined
): MturkQualificationRequirement[] {
  if (!value?.trim()) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error(
      `MTURK_QUALIFICATION_REQUIREMENTS_JSON must be valid JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error(
      "MTURK_QUALIFICATION_REQUIREMENTS_JSON must be a JSON array"
    );
  }

  return parsed.map((requirement, index) =>
    parseQualificationRequirement(requirement, index)
  );
}

function parseQualificationRequirement(
  value: unknown,
  index: number
): MturkQualificationRequirement {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      `MTURK_QUALIFICATION_REQUIREMENTS_JSON[${index}] must be an object`
    );
  }

  const requirement = value as Record<string, unknown>;
  if (
    typeof requirement.QualificationTypeId !== "string" ||
    !requirement.QualificationTypeId.trim()
  ) {
    throw new Error(
      `MTURK_QUALIFICATION_REQUIREMENTS_JSON[${index}].QualificationTypeId must be a non-empty string`
    );
  }
  if (
    typeof requirement.Comparator !== "string" ||
    !requirement.Comparator.trim()
  ) {
    throw new Error(
      `MTURK_QUALIFICATION_REQUIREMENTS_JSON[${index}].Comparator must be a non-empty string`
    );
  }

  const integerValues = Array.isArray(requirement.IntegerValues)
    ? requirement.IntegerValues.map((item) => Number(item))
    : undefined;
  if (integerValues?.some((item) => !Number.isInteger(item))) {
    throw new Error(
      `MTURK_QUALIFICATION_REQUIREMENTS_JSON[${index}].IntegerValues must contain only integers`
    );
  }
  const localeValues = Array.isArray(requirement.LocaleValues)
    ? parseLocaleValues(requirement.LocaleValues, index)
    : undefined;

  return {
    QualificationTypeId: requirement.QualificationTypeId,
    Comparator: requirement.Comparator,
    ...(typeof requirement.ActionsGuarded === "string" &&
    requirement.ActionsGuarded.trim()
      ? { ActionsGuarded: requirement.ActionsGuarded }
      : {}),
    ...(integerValues ? { IntegerValues: integerValues } : {}),
    ...(localeValues ? { LocaleValues: localeValues } : {}),
    ...(typeof requirement.RequiredToPreview === "boolean"
      ? { RequiredToPreview: requirement.RequiredToPreview }
      : {})
  };
}

function parseLocaleValues(values: unknown[], requirementIndex: number) {
  return values.map((item, localeIndex) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(
        `MTURK_QUALIFICATION_REQUIREMENTS_JSON[${requirementIndex}].LocaleValues[${localeIndex}] must be an object`
      );
    }
    const locale = item as Record<string, unknown>;
    const parsed = {
      ...(typeof locale.Country === "string" && locale.Country.trim()
        ? { Country: locale.Country }
        : {}),
      ...(typeof locale.Subdivision === "string" && locale.Subdivision.trim()
        ? { Subdivision: locale.Subdivision }
        : {})
    };
    if (!parsed.Country && !parsed.Subdivision) {
      throw new Error(
        `MTURK_QUALIFICATION_REQUIREMENTS_JSON[${requirementIndex}].LocaleValues[${localeIndex}] must include Country or Subdivision`
      );
    }
    return parsed;
  });
}

export function validateBridgeSafety(config: BridgeSafetyConfig): string[] {
  const errors: string[] = [];
  const reward = Number(config.reward);
  const spendPerHit = reward * config.maxAssignments;
  const hasValidMaxAssignmentsPerHit = isPositiveNumber(
    config.maxAssignmentsPerHit
  );
  const hasValidMaxRewardUsd = isPositiveNumber(config.maxRewardUsd);
  const hasValidMaxSpendPerHitUsd = isPositiveNumber(config.maxSpendPerHitUsd);
  const hasValidMinTaskDurationSeconds = isPositiveNumber(
    config.minTaskDurationSeconds
  );
  const hasValidMinExpirationSeconds = isPositiveNumber(
    config.minExpirationSeconds
  );
  const hasValidMinAutoApprovalDelaySeconds = isPositiveNumber(
    config.minAutoApprovalDelaySeconds
  );

  addPositiveNumberError(
    errors,
    "MTURK_MAX_ASSIGNMENTS_PER_HIT",
    config.maxAssignmentsPerHit
  );
  addPositiveNumberError(errors, "MTURK_MAX_REWARD_USD", config.maxRewardUsd);
  addPositiveNumberError(
    errors,
    "MTURK_MAX_SPEND_PER_HIT_USD",
    config.maxSpendPerHitUsd
  );
  addPositiveNumberError(
    errors,
    "MTURK_MIN_TASK_DURATION_SECONDS",
    config.minTaskDurationSeconds
  );
  addPositiveNumberError(
    errors,
    "MTURK_MIN_EXPIRATION_SECONDS",
    config.minExpirationSeconds
  );
  addPositiveNumberError(
    errors,
    "MTURK_MIN_AUTO_APPROVAL_DELAY_SECONDS",
    config.minAutoApprovalDelaySeconds
  );

  if (!Number.isFinite(reward) || reward <= 0) {
    errors.push("MTURK_REWARD must be a positive USD amount");
  }
  if (!Number.isInteger(config.maxAssignments) || config.maxAssignments < 1) {
    errors.push("MTURK_MAX_ASSIGNMENTS must be a positive integer");
  }
  if (
    hasValidMaxAssignmentsPerHit &&
    config.maxAssignments > config.maxAssignmentsPerHit
  ) {
    errors.push(
      `MTURK_MAX_ASSIGNMENTS ${config.maxAssignments} exceeds MTURK_MAX_ASSIGNMENTS_PER_HIT ${config.maxAssignmentsPerHit}`
    );
  }
  if (hasValidMaxRewardUsd && reward > config.maxRewardUsd) {
    errors.push(
      `MTURK_REWARD ${config.reward} exceeds MTURK_MAX_REWARD_USD ${config.maxRewardUsd}`
    );
  }
  if (
    hasValidMaxSpendPerHitUsd &&
    Number.isFinite(spendPerHit) &&
    spendPerHit > config.maxSpendPerHitUsd
  ) {
    errors.push(
      `Per-HIT spend ${spendPerHit.toFixed(2)} exceeds MTURK_MAX_SPEND_PER_HIT_USD ${config.maxSpendPerHitUsd}`
    );
  }
  if (
    hasValidMinTaskDurationSeconds &&
    config.taskDurationSeconds < config.minTaskDurationSeconds
  ) {
    errors.push(
      `MTURK_TASK_DURATION_SECONDS ${config.taskDurationSeconds} is below MTURK_MIN_TASK_DURATION_SECONDS ${config.minTaskDurationSeconds}`
    );
  }
  if (
    hasValidMinExpirationSeconds &&
    config.expirationSeconds < config.minExpirationSeconds
  ) {
    errors.push(
      `MTURK_EXPIRATION_SECONDS ${config.expirationSeconds} is below MTURK_MIN_EXPIRATION_SECONDS ${config.minExpirationSeconds}`
    );
  }
  if (
    hasValidMinAutoApprovalDelaySeconds &&
    config.autoApprovalDelaySeconds < config.minAutoApprovalDelaySeconds
  ) {
    errors.push(
      `MTURK_AUTO_APPROVAL_DELAY_SECONDS ${config.autoApprovalDelaySeconds} is below MTURK_MIN_AUTO_APPROVAL_DELAY_SECONDS ${config.minAutoApprovalDelaySeconds}`
    );
  }

  return errors;
}

// Per-dispatch pricing from a structured task template overrides the
// bridge-wide defaults but must stay inside the same safety rails.
export function resolveDispatchPricing(input: {
  config: Pick<
    BridgeSafetyConfig,
    | "maxAssignments"
    | "maxAssignmentsPerHit"
    | "maxRewardUsd"
    | "maxSpendPerHitUsd"
    | "reward"
  >;
  pricing?: TemplatePricing;
}): { errors: string[]; maxAssignments: number; reward: string } {
  const { config, pricing } = input;
  const maxAssignments = pricing?.max_assignments ?? config.maxAssignments;
  const reward = pricing?.reward ?? config.reward;

  if (!pricing) {
    return { errors: [], maxAssignments, reward };
  }

  const errors: string[] = [];
  const rewardValue = Number(reward);
  const spendPerHit = rewardValue * maxAssignments;
  if (rewardValue > config.maxRewardUsd) {
    errors.push(
      `pricing.reward ${reward} exceeds MTURK_MAX_REWARD_USD ${config.maxRewardUsd}`
    );
  }
  if (maxAssignments > config.maxAssignmentsPerHit) {
    errors.push(
      `pricing.max_assignments ${maxAssignments} exceeds MTURK_MAX_ASSIGNMENTS_PER_HIT ${config.maxAssignmentsPerHit}`
    );
  }
  if (spendPerHit > config.maxSpendPerHitUsd) {
    errors.push(
      `Per-HIT spend ${spendPerHit.toFixed(2)} exceeds MTURK_MAX_SPEND_PER_HIT_USD ${config.maxSpendPerHitUsd}`
    );
  }

  return { errors, maxAssignments, reward };
}

function isPositiveNumber(value: number) {
  return Number.isFinite(value) && value > 0;
}

function addPositiveNumberError(errors: string[], name: string, value: number) {
  if (!isPositiveNumber(value)) {
    errors.push(`${name} must be a positive number`);
  }
}

export function buildHtmlQuestion(input: {
  criterionIds: string[];
  reviewTaskId: string;
  sandbox: boolean;
  taskTemplate: string;
  visualEvidence?: BridgeVisualEvidence;
}) {
  const submitBase = input.sandbox
    ? "https://workersandbox.mturk.com"
    : "https://www.mturk.com";
  const parsedTemplate = parseTaskTemplate(input.taskTemplate);
  const formBody =
    parsedTemplate.kind === "structured"
      ? renderStructuredFormBody({
          criterionIds: input.criterionIds,
          envelope: parsedTemplate.envelope,
          reviewTaskId: input.reviewTaskId,
          visualEvidence: input.visualEvidence
            ? {
                caption: input.visualEvidence.caption,
                data_url: input.visualEvidence.data_url
              }
            : undefined
        })
      : legacyFormBody(input);

  const preFormHtml =
    parsedTemplate.kind === "structured"
      ? ""
      : `<p>${escapeHtml(input.taskTemplate)}</p>
    ${renderVisualEvidence(input.visualEvidence)}`;

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Human Review Task</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 24px; line-height: 1.4; }
      fieldset { margin-bottom: 16px; }
      figure { border: 1px solid #ccc; margin: 16px 0; padding: 12px; }
      figcaption { color: #444; font-size: 14px; margin-top: 8px; }
      img.visual-evidence { display: block; height: auto; max-width: 100%; }
      textarea { width: 100%; min-height: 120px; }
      pre.content { background: #f6f6f6; border: 1px solid #ddd; padding: 12px; white-space: pre-wrap; }
      .hint { color: #555; margin-bottom: 16px; }
      .metadata { color: #555; font-size: 13px; }
      .criterion label, .stack label { display: block; margin: 8px 0; }
    </style>
    <script type="text/javascript" src="https://s3.amazonaws.com/mturk-public/externalHIT_v1.js"></script>
  </head>
  <body>
    <h1>Human Review</h1>
    <p class="metadata">Review task ${escapeHtml(input.reviewTaskId)}. Evaluate only what you can observe in the evidence shown.</p>
    ${preFormHtml}
    <form name="mturk_form" method="post" id="mturk_form" action="${submitBase}/mturk/externalSubmit">
      <input type="hidden" id="assignmentId" name="assignmentId" value="" />

      ${formBody}

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

function legacyFormBody(input: { criterionIds: string[] }) {
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

  return `
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
  `;
}

function renderVisualEvidence(evidence: BridgeVisualEvidence | undefined) {
  if (!evidence) {
    return "";
  }

  return `
    <section aria-label="Visual evidence">
      <h2>Visual evidence</h2>
      <figure>
        <img class="visual-evidence" src="${escapeAttribute(evidence.data_url)}" alt="${escapeAttribute(evidence.caption)}" />
        <figcaption>${escapeHtml(evidence.caption)}</figcaption>
      </figure>
      <p class="metadata">
        Artifact: ${escapeHtml(evidence.artifact_id)} |
        Viewport: ${escapeHtml(evidence.viewport)} |
        Hash: ${escapeHtml(evidence.content_hash)}
      </p>
    </section>
  `;
}

export function parseAnswerXml(answerXml: string) {
  const answers = [...answerXml.matchAll(/<Answer>([\s\S]*?)<\/Answer>/g)];
  const fields = new Map<string, string>();

  for (const [, answerBlock] of answers) {
    const identifier = answerBlock
      .match(/<QuestionIdentifier>([\s\S]*?)<\/QuestionIdentifier>/)?.[1]
      ?.trim();
    const freeText =
      answerBlock.match(/<FreeText>([\s\S]*?)<\/FreeText>/)?.[1]?.trim() ?? "";
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
  taskTemplate?: string;
  workerId: string;
}) {
  const fields = parseAnswerXml(input.answerXml);
  const parsedTemplate =
    input.taskTemplate === undefined
      ? undefined
      : parseTaskTemplate(input.taskTemplate);

  if (parsedTemplate?.kind === "structured") {
    const normalized = normalizeStructuredAnswers({
      criterionIds: input.criterionIds,
      envelope: parsedTemplate.envelope,
      fields
    });
    return {
      ...normalized,
      delivery_mode: "polling" as const,
      provider_assignment_ref: input.assignmentId,
      provider_id: input.providerId,
      provider_response_id: input.assignmentId,
      provider_task_id: input.providerTaskId,
      reviewer_pseudonymous_id: input.workerId
    };
  }

  return {
    criterion_results: input.criterionIds.map((criterionId, index) => ({
      criterion_id: criterionId,
      confidence: (fields.get(`criterion_${index}_confidence`) ?? "medium") as
        | "low"
        | "medium"
        | "high",
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
    severity: (fields.get("severity") ?? "S3") as
      | "S0"
      | "S1"
      | "S2"
      | "S3"
      | "S4"
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

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/"/g, "&quot;");
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
