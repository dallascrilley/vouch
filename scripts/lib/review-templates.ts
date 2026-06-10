// Structured task-template envelope and survey template catalog.
//
// The broker treats `task_template` as an opaque string; the client builds a
// structured envelope and the MTurk bridge renders/normalizes it. See
// docs/architecture/agent-loop-integration.md.

export type ReviewTemplateId =
  | "binary_screenshot_check"
  | "pairwise_screenshot_compare"
  | "text_quality_rubric"
  | "data_extraction_check"
  | "instruction_following_check";

export type RiskTier = "low" | "medium" | "high";

export type TemplateCriterion = {
  id: string;
  statement: string;
};

export type TemplatePricing = {
  max_assignments: number;
  reward: string;
};

export type TemplateAttentionCheck = {
  expected: string;
  prompt: string;
};

export type ReviewSeverity = "S0" | "S1" | "S2" | "S3" | "S4";

export type CriterionStatus = "pass" | "fail" | "unclear" | "not_visible";

export type StructuredTaskTemplateBase = {
  attention_check?: TemplateAttentionCheck;
  default_severity?: ReviewSeverity;
  instructions: string;
  pricing?: TemplatePricing;
  v: 1;
};

export type PairwiseVariant = {
  caption: string;
  data_url: string;
};

export type StructuredTaskTemplate = StructuredTaskTemplateBase &
  (
    | {
        params: { criteria: TemplateCriterion[] };
        template_id: "binary_screenshot_check";
      }
    | {
        params: {
          candidate: "a" | "b";
          criteria: TemplateCriterion[];
          variant_a: PairwiseVariant;
          variant_b: PairwiseVariant;
        };
        template_id: "pairwise_screenshot_compare";
      }
    | {
        params: { content: string; criteria: TemplateCriterion[] };
        template_id: "text_quality_rubric";
      }
    | {
        params: {
          fields: Array<{
            criterion_id: string;
            extracted_value: string;
            field_name: string;
          }>;
        };
        template_id: "data_extraction_check";
      }
    | {
        params: {
          content: string;
          criteria: TemplateCriterion[];
          instructions_text: string;
        };
        template_id: "instruction_following_check";
      }
  );

export type ParsedTaskTemplate =
  | { envelope: StructuredTaskTemplate; kind: "structured" }
  | { kind: "legacy"; text: string };

export const REVIEW_TEMPLATE_IDS: ReviewTemplateId[] = [
  "binary_screenshot_check",
  "pairwise_screenshot_compare",
  "text_quality_rubric",
  "data_extraction_check",
  "instruction_following_check"
];

const SEVERITIES: ReviewSeverity[] = ["S0", "S1", "S2", "S3", "S4"];

// MTurk rejects CreateHIT when QuestionXML exceeds 131,072 characters. Inline
// data URLs dominate that budget; keep them under this cap so the page shell,
// instructions, and form fit in the remainder (~20K observed overhead ceiling).
export const MAX_VISUAL_DATA_URL_CHARS = 110_000;

const ANSWER_OPTIONS: Record<
  ReviewTemplateId,
  Array<{ label: string; value: string }>
> = {
  binary_screenshot_check: [
    { label: "Yes", value: "yes" },
    { label: "No", value: "no" },
    { label: "Can't tell", value: "cant_tell" }
  ],
  data_extraction_check: [
    { label: "Correct", value: "correct" },
    { label: "Incorrect", value: "incorrect" },
    { label: "Not visible", value: "not_visible" }
  ],
  instruction_following_check: [
    { label: "Yes", value: "yes" },
    { label: "No", value: "no" },
    { label: "Can't tell", value: "cant_tell" }
  ],
  pairwise_screenshot_compare: [
    { label: "Version 1", value: "a" },
    { label: "Version 2", value: "b" },
    { label: "They are equal", value: "tie" },
    { label: "Can't tell", value: "cant_tell" }
  ],
  text_quality_rubric: [
    { label: "1 — Very poor", value: "1" },
    { label: "2 — Poor", value: "2" },
    { label: "3 — Mixed", value: "3" },
    { label: "4 — Good", value: "4" },
    { label: "5 — Excellent", value: "5" }
  ]
};

// Per-assignment rewards target a >= ~$12/hour effective wage for the
// estimated completion time of each template.
const PRESET_REWARDS: Record<ReviewTemplateId, string> = {
  binary_screenshot_check: "0.10",
  data_extraction_check: "0.12",
  instruction_following_check: "0.17",
  pairwise_screenshot_compare: "0.12",
  text_quality_rubric: "0.15"
};

const ASSIGNMENTS_BY_RISK: Record<RiskTier, number> = {
  high: 5,
  low: 1,
  medium: 3
};

export function recommendedPricing(
  templateId: ReviewTemplateId,
  riskTier: RiskTier
): TemplatePricing {
  return {
    max_assignments: ASSIGNMENTS_BY_RISK[riskTier],
    reward: PRESET_REWARDS[templateId]
  };
}

// MTurk fee: 20% of the reward per assignment (40% when max_assignments >= 10),
// with a $0.01 per-assignment minimum.
export function estimateTemplateCost(pricing: TemplatePricing): number {
  const reward = Number(pricing.reward);
  const feeRate = pricing.max_assignments >= 10 ? 0.4 : 0.2;
  const feePerAssignment = Math.max(reward * feeRate, 0.01);
  return (
    Math.round((reward + feePerAssignment) * pricing.max_assignments * 100) /
    100
  );
}

export function buildStructuredTaskTemplate(
  envelope: StructuredTaskTemplate
): string {
  const errors = collectEnvelopeErrors(envelope);
  if (errors.length > 0) {
    throw new Error(`Invalid task template envelope: ${errors.join("; ")}`);
  }
  return JSON.stringify(envelope);
}

// A task_template that parses to a JSON object must be a valid envelope:
// silently rendering raw JSON to workers would produce garbage signal.
// Anything else is legacy free text.
export function parseTaskTemplate(raw: string): ParsedTaskTemplate {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) {
    return { kind: "legacy", text: raw };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { kind: "legacy", text: raw };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { kind: "legacy", text: raw };
  }

  const errors = collectEnvelopeErrors(parsed);
  if (errors.length > 0) {
    throw new Error(`Invalid task template envelope: ${errors.join("; ")}`);
  }
  return { envelope: parsed as StructuredTaskTemplate, kind: "structured" };
}

function collectEnvelopeErrors(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return ["envelope must be a JSON object"];
  }

  const envelope = value as Record<string, unknown>;
  const errors: string[] = [];

  if (envelope.v !== 1) {
    errors.push("v must be 1");
  }
  const templateId = envelope.template_id;
  if (
    typeof templateId !== "string" ||
    !REVIEW_TEMPLATE_IDS.includes(templateId as ReviewTemplateId)
  ) {
    errors.push(
      `template_id must be one of: ${REVIEW_TEMPLATE_IDS.join(", ")}`
    );
    return errors;
  }
  if (
    typeof envelope.instructions !== "string" ||
    !envelope.instructions.trim()
  ) {
    errors.push("instructions must be a non-empty string");
  }
  if (envelope.pricing !== undefined) {
    errors.push(...collectPricingErrors(envelope.pricing));
  }
  if (envelope.attention_check !== undefined) {
    errors.push(
      ...collectAttentionCheckErrors(
        envelope.attention_check,
        templateId as ReviewTemplateId
      )
    );
  }
  if (
    envelope.default_severity !== undefined &&
    !SEVERITIES.includes(envelope.default_severity as ReviewSeverity)
  ) {
    errors.push(`default_severity must be one of: ${SEVERITIES.join(", ")}`);
  }
  errors.push(
    ...collectParamsErrors(envelope.params, templateId as ReviewTemplateId)
  );

  return errors;
}

function collectPricingErrors(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return ["pricing must be an object"];
  }
  const pricing = value as Record<string, unknown>;
  const errors: string[] = [];
  const reward = Number(pricing.reward);
  if (
    typeof pricing.reward !== "string" ||
    !Number.isFinite(reward) ||
    reward <= 0
  ) {
    errors.push("pricing.reward must be a positive USD amount string");
  }
  if (
    !Number.isInteger(pricing.max_assignments) ||
    (pricing.max_assignments as number) < 1
  ) {
    errors.push("pricing.max_assignments must be a positive integer");
  }
  return errors;
}

function collectAttentionCheckErrors(
  value: unknown,
  templateId: ReviewTemplateId
): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return ["attention_check must be an object"];
  }
  const check = value as Record<string, unknown>;
  const errors: string[] = [];
  if (typeof check.prompt !== "string" || !check.prompt.trim()) {
    errors.push("attention_check.prompt must be a non-empty string");
  }
  const validValues = ANSWER_OPTIONS[templateId].map((option) => option.value);
  if (
    typeof check.expected !== "string" ||
    !validValues.includes(check.expected)
  ) {
    errors.push(
      `attention_check.expected must be one of: ${validValues.join(", ")}`
    );
  }
  return errors;
}

function collectParamsErrors(
  value: unknown,
  templateId: ReviewTemplateId
): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return ["params must be an object"];
  }
  const params = value as Record<string, unknown>;
  const errors: string[] = [];

  if (templateId === "data_extraction_check") {
    if (!Array.isArray(params.fields) || params.fields.length === 0) {
      errors.push("params.fields must be a non-empty array");
    } else {
      params.fields.forEach((field, index) => {
        const record = (field ?? {}) as Record<string, unknown>;
        for (const key of [
          "criterion_id",
          "extracted_value",
          "field_name"
        ] as const) {
          if (typeof record[key] !== "string" || !record[key].trim()) {
            errors.push(
              `params.fields[${index}].${key} must be a non-empty string`
            );
          }
        }
      });
    }
    return errors;
  }

  if (!Array.isArray(params.criteria) || params.criteria.length === 0) {
    errors.push("params.criteria must be a non-empty array");
  } else {
    params.criteria.forEach((criterion, index) => {
      const record = (criterion ?? {}) as Record<string, unknown>;
      for (const key of ["id", "statement"] as const) {
        if (typeof record[key] !== "string" || !record[key].trim()) {
          errors.push(
            `params.criteria[${index}].${key} must be a non-empty string`
          );
        }
      }
    });
  }

  if (templateId === "pairwise_screenshot_compare") {
    if (params.candidate !== "a" && params.candidate !== "b") {
      errors.push('params.candidate must be "a" or "b"');
    }
    let combinedDataUrlChars = 0;
    for (const key of ["variant_a", "variant_b"] as const) {
      const variant = params[key];
      if (!variant || typeof variant !== "object" || Array.isArray(variant)) {
        errors.push(`params.${key} must be an object`);
        continue;
      }
      const record = variant as Record<string, unknown>;
      for (const field of ["caption", "data_url"] as const) {
        if (typeof record[field] !== "string" || !record[field].trim()) {
          errors.push(`params.${key}.${field} must be a non-empty string`);
        }
      }
      if (typeof record.data_url === "string") {
        combinedDataUrlChars += record.data_url.length;
      }
    }
    if (combinedDataUrlChars > MAX_VISUAL_DATA_URL_CHARS) {
      errors.push(
        `combined variant data_url length ${combinedDataUrlChars} exceeds ${MAX_VISUAL_DATA_URL_CHARS} (MTurk QuestionXML limit); compress screenshots to JPEG (~40KB each)`
      );
    }
  }

  if (
    (templateId === "text_quality_rubric" ||
      templateId === "instruction_following_check") &&
    (typeof params.content !== "string" || !params.content.trim())
  ) {
    errors.push("params.content must be a non-empty string");
  }
  if (
    templateId === "instruction_following_check" &&
    (typeof params.instructions_text !== "string" ||
      !params.instructions_text.trim())
  ) {
    errors.push("params.instructions_text must be a non-empty string");
  }

  return errors;
}

// Deterministic pairwise display order: cancels position bias across tasks
// while keeping any single HIT reproducible from its review-task id.
export function pairwiseDisplaySwapped(reviewTaskId: string): boolean {
  let hash = 2166136261;
  for (let index = 0; index < reviewTaskId.length; index += 1) {
    hash ^= reviewTaskId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 2 === 1;
}

export function renderStructuredFormBody(input: {
  criterionIds: string[];
  envelope: StructuredTaskTemplate;
  reviewTaskId: string;
  visualEvidence?: {
    caption: string;
    data_url: string;
  };
}): string {
  const { envelope } = input;
  const sections: string[] = [
    `<p class="hint">${escapeHtml(envelope.instructions)}</p>`
  ];

  if (envelope.template_id === "pairwise_screenshot_compare") {
    sections.push(renderPairwiseEvidence(envelope, input.reviewTaskId));
  } else if (input.visualEvidence) {
    sections.push(`
      <figure>
        <img class="visual-evidence" src="${escapeAttribute(input.visualEvidence.data_url)}" alt="${escapeAttribute(input.visualEvidence.caption)}" />
        <figcaption>${escapeHtml(input.visualEvidence.caption)}</figcaption>
      </figure>
    `);
  }

  if (
    envelope.template_id === "text_quality_rubric" ||
    envelope.template_id === "instruction_following_check"
  ) {
    if (envelope.template_id === "instruction_following_check") {
      sections.push(`
        <section>
          <h2>Instructions the text below was supposed to follow</h2>
          <pre class="content">${escapeHtml(envelope.params.instructions_text)}</pre>
        </section>
      `);
    }
    sections.push(`
      <section>
        <h2>Text to review</h2>
        <pre class="content">${escapeHtml(envelope.params.content)}</pre>
      </section>
    `);
  }

  sections.push(...renderQuestionRows(envelope, input));

  if (envelope.attention_check) {
    sections.push(
      renderChoiceRow({
        legend: envelope.attention_check.prompt,
        name: "attention_check_answer",
        options: pairwiseAwareOptions(envelope, input.reviewTaskId)
      })
    );
  }

  sections.push(`
    <fieldset class="stack">
      <legend>How confident are you in your answers?</legend>
      <label>
        Confidence
        <select name="confidence" required>
          <option value="">Select…</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </label>
    </fieldset>
    <label>
      In one or two sentences, what did you look at to decide?
      <textarea name="evidence_note" required minlength="15"></textarea>
    </label>
  `);

  return sections.join("\n");
}

function renderPairwiseEvidence(
  envelope: Extract<
    StructuredTaskTemplate,
    { template_id: "pairwise_screenshot_compare" }
  >,
  reviewTaskId: string
): string {
  const swapped = pairwiseDisplaySwapped(reviewTaskId);
  const first = swapped ? envelope.params.variant_b : envelope.params.variant_a;
  const second = swapped
    ? envelope.params.variant_a
    : envelope.params.variant_b;

  return `
    <section class="pairwise" aria-label="Versions to compare">
      ${[first, second]
        .map(
          (variant, index) => `
        <figure>
          <figcaption><strong>Version ${index + 1}</strong> — ${escapeHtml(variant.caption)}</figcaption>
          <img class="visual-evidence" src="${escapeAttribute(variant.data_url)}" alt="Version ${index + 1}" />
        </figure>
      `
        )
        .join("\n")}
    </section>
  `;
}

function renderQuestionRows(
  envelope: StructuredTaskTemplate,
  input: { criterionIds: string[]; reviewTaskId: string }
): string[] {
  if (envelope.template_id === "data_extraction_check") {
    return input.criterionIds.map((criterionId, index) => {
      const field = envelope.params.fields.find(
        (candidate) => candidate.criterion_id === criterionId
      );
      const legend = field
        ? `${field.field_name}: <code>${escapeHtml(field.extracted_value)}</code> — is this value correct per the screenshot?`
        : `Is the value recorded for "${escapeHtml(criterionId)}" correct per the screenshot?`;
      return renderChoiceRow({
        legend,
        legendIsHtml: true,
        name: `criterion_${index}_answer`,
        number: index + 1,
        options: ANSWER_OPTIONS.data_extraction_check
      });
    });
  }

  const statements = new Map(
    envelope.params.criteria.map((criterion) => [
      criterion.id,
      criterion.statement
    ])
  );
  return input.criterionIds.map((criterionId, index) =>
    renderChoiceRow({
      legend: questionForStatement(
        envelope.template_id,
        statements.get(criterionId) ?? criterionId
      ),
      name: `criterion_${index}_answer`,
      number: index + 1,
      options: pairwiseAwareOptions(envelope, input.reviewTaskId)
    })
  );
}

function questionForStatement(
  templateId: ReviewTemplateId,
  statement: string
): string {
  switch (templateId) {
    case "binary_screenshot_check":
      return `Looking at the screenshot, is this true? "${statement}"`;
    case "instruction_following_check":
      return `Is this true of the text above? "${statement}"`;
    case "pairwise_screenshot_compare":
      return `Which version better satisfies: "${statement}"`;
    case "text_quality_rubric":
      return `Rate the text above on: "${statement}"`;
    default:
      return statement;
  }
}

// Pairwise option labels say "Version 1"/"Version 2" but option values stay
// canonical ("a"/"b"), so normalization is independent of display order.
function pairwiseAwareOptions(
  envelope: StructuredTaskTemplate,
  reviewTaskId: string
): Array<{ label: string; value: string }> {
  const options = ANSWER_OPTIONS[envelope.template_id];
  if (
    envelope.template_id !== "pairwise_screenshot_compare" ||
    !pairwiseDisplaySwapped(reviewTaskId)
  ) {
    return options;
  }
  return options.map((option) => {
    if (option.value === "a") {
      return { label: "Version 2", value: "a" };
    }
    if (option.value === "b") {
      return { label: "Version 1", value: "b" };
    }
    return option;
  });
}

function renderChoiceRow(input: {
  legend: string;
  legendIsHtml?: boolean;
  name: string;
  number?: number;
  options: Array<{ label: string; value: string }>;
}): string {
  const prefix = input.number === undefined ? "" : `Q${input.number}. `;
  const legend = input.legendIsHtml ? input.legend : escapeHtml(input.legend);
  const options = input.options
    .map(
      (option) => `
        <label>
          <input type="radio" name="${input.name}" value="${option.value}" required />
          ${escapeHtml(option.label)}
        </label>
      `
    )
    .join("\n");
  return `
    <fieldset class="criterion">
      <legend>${prefix}${legend}</legend>
      ${options}
    </fieldset>
  `;
}

export type StructuredNormalizationResult = {
  criterion_results: Array<{
    confidence: "low" | "medium" | "high";
    criterion_id: string;
    status: CriterionStatus;
  }>;
  defect_category: string;
  evidence_note: string;
  overall_verdict: "pass" | "fail" | "unclear" | "artifact_insufficient";
  quality_flags: string[];
  severity: ReviewSeverity;
};

export function normalizeStructuredAnswers(input: {
  criterionIds: string[];
  envelope: StructuredTaskTemplate;
  fields: Map<string, string>;
}): StructuredNormalizationResult {
  const { envelope, fields } = input;
  const confidenceRaw = fields.get("confidence");
  const confidence: "low" | "medium" | "high" =
    confidenceRaw === "low" || confidenceRaw === "high"
      ? confidenceRaw
      : "medium";

  const criterionResults = input.criterionIds.map((criterionId, index) => ({
    confidence,
    criterion_id: criterionId,
    status: mapAnswerToStatus(envelope, fields.get(`criterion_${index}_answer`))
  }));

  const qualityFlags: string[] = [];
  if (
    envelope.attention_check &&
    fields.get("attention_check_answer") !== envelope.attention_check.expected
  ) {
    qualityFlags.push("attention_check_failed");
  }

  const statuses = criterionResults.map((result) => result.status);
  const overallVerdict = statuses.includes("fail")
    ? "fail"
    : statuses.includes("not_visible")
      ? "artifact_insufficient"
      : statuses.includes("unclear")
        ? "unclear"
        : "pass";

  const firstFailed = criterionResults.find(
    (result) => result.status === "fail"
  );

  return {
    criterion_results: criterionResults,
    defect_category: firstFailed
      ? `${envelope.template_id}:${firstFailed.criterion_id}`
      : envelope.template_id,
    evidence_note:
      fields.get("evidence_note")?.trim() || "No reviewer note provided.",
    overall_verdict: overallVerdict,
    quality_flags: qualityFlags,
    severity:
      overallVerdict === "fail" ? (envelope.default_severity ?? "S2") : "S4"
  };
}

function mapAnswerToStatus(
  envelope: StructuredTaskTemplate,
  answer: string | undefined
): CriterionStatus {
  if (answer === undefined || answer === "") {
    return "unclear";
  }

  switch (envelope.template_id) {
    case "binary_screenshot_check":
    case "instruction_following_check":
      return answer === "yes"
        ? "pass"
        : answer === "no"
          ? "fail"
          : answer === "cant_tell"
            ? "not_visible"
            : "unclear";
    case "data_extraction_check":
      return answer === "correct"
        ? "pass"
        : answer === "incorrect"
          ? "fail"
          : answer === "not_visible"
            ? "not_visible"
            : "unclear";
    case "pairwise_screenshot_compare": {
      if (answer === "cant_tell") {
        return "not_visible";
      }
      if (answer === "tie") {
        return "unclear";
      }
      if (answer !== "a" && answer !== "b") {
        return "unclear";
      }
      return answer === envelope.params.candidate ? "pass" : "fail";
    }
    case "text_quality_rubric": {
      const rating = Number(answer);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return "unclear";
      }
      return rating >= 4 ? "pass" : rating <= 2 ? "fail" : "unclear";
    }
  }
}

export function escapeAttribute(value: string) {
  return escapeHtml(value);
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
