// One-shot human review for any agentic loop or CI step.
//
//   npm run review -- --template binary_screenshot_check \
//     --question "hero-cta-no-overlap:The orange CTA does not overlap the hero headline." \
//     --screenshot .runtime/shots/hero.png --risk medium --wait
//
// Exit codes: 0 pass, 1 fail, 2 retry, 3 recapture, 4 escalate,
// 5 timeout/pending, 64 usage error. stdout is a single JSON object.

import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";

import {
  requestHumanReview,
  waitForFeedback,
  type ReviewCriterion
} from "./lib/agent-review-client.js";
import {
  estimateTemplateCost,
  recommendedPricing,
  REVIEW_TEMPLATE_IDS,
  type ReviewTemplateId,
  type StructuredTaskTemplate,
  type TemplateCriterion
} from "./lib/review-templates.js";

const EXIT_BY_ACTION: Record<string, number> = {
  escalate: 4,
  fail: 1,
  pass: 0,
  recapture: 3,
  retry: 2
};

const DEFAULT_INSTRUCTIONS: Record<ReviewTemplateId, string> = {
  binary_screenshot_check:
    "Look at the screenshot and answer each question about what you can actually see.",
  data_extraction_check:
    "Check each recorded value against the screenshot and mark whether it is correct.",
  instruction_following_check:
    "Read the instructions and the text below them, then answer each question.",
  pairwise_screenshot_compare:
    "Compare the two versions and answer each question.",
  text_quality_rubric: "Read the text and rate it on each statement."
};

function usageError(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(64);
}

async function main() {
  const { values } = parseArgs({
    options: {
      "agent-run-id": { type: "string" },
      assignments: { type: "string" },
      "attention-expected": { type: "string" },
      "attention-prompt": { type: "string" },
      "broker-url": { type: "string" },
      candidate: { type: "string" },
      caption: { type: "string" },
      "caption-a": { type: "string" },
      "caption-b": { type: "string" },
      content: { type: "string" },
      "content-file": { type: "string" },
      "data-class": { type: "string" },
      estimate: { type: "boolean" },
      field: { multiple: true, type: "string" },
      instructions: { type: "string" },
      "poll-seconds": { type: "string" },
      pool: { type: "string" },
      provider: { type: "string" },
      question: { multiple: true, type: "string" },
      resume: { type: "string" },
      reward: { type: "string" },
      risk: { type: "string" },
      screenshot: { type: "string" },
      spec: { type: "string" },
      "spec-file": { type: "string" },
      template: { type: "string" },
      "timeout-seconds": { type: "string" },
      "variant-a": { type: "string" },
      "variant-b": { type: "string" },
      viewport: { type: "string" },
      wait: { type: "boolean" }
    }
  });

  const brokerBaseUrl =
    values["broker-url"] ??
    process.env.BROKER_BASE_URL ??
    "http://127.0.0.1:3000";
  const pollIntervalMs = values["poll-seconds"]
    ? Number(values["poll-seconds"]) * 1000
    : undefined;
  const timeoutMs = values["timeout-seconds"]
    ? Number(values["timeout-seconds"]) * 1000
    : undefined;

  if (values.resume) {
    const wait = await waitForFeedback({
      brokerBaseUrl,
      jobId: values.resume,
      pollIntervalMs,
      timeoutMs
    });
    emit({
      feedback: wait.feedback,
      job_id: values.resume,
      timed_out: wait.timedOut
    });
    process.exit(
      wait.feedback ? (EXIT_BY_ACTION[wait.feedback.agent_next_action] ?? 5) : 5
    );
  }

  const templateId = (values.template ??
    "binary_screenshot_check") as ReviewTemplateId;
  if (!REVIEW_TEMPLATE_IDS.includes(templateId)) {
    usageError(`--template must be one of: ${REVIEW_TEMPLATE_IDS.join(", ")}`);
  }
  const riskRaw = values.risk ?? "medium";
  if (riskRaw !== "low" && riskRaw !== "medium" && riskRaw !== "high") {
    usageError("--risk must be low, medium, or high");
  }
  const riskTier = riskRaw;

  const templateCriteria = parseCriteria(values, templateId);
  const pricing = {
    max_assignments: values.assignments
      ? Number(values.assignments)
      : recommendedPricing(templateId, riskTier).max_assignments,
    reward: values.reward ?? recommendedPricing(templateId, riskTier).reward
  };
  const envelope = buildEnvelope({
    pricing,
    templateCriteria,
    templateId,
    values
  });

  if (values.estimate) {
    emit({
      envelope,
      estimated_cost_usd: estimateTemplateCost(pricing),
      pricing
    });
    process.exit(0);
  }

  const criteria: ReviewCriterion[] = templateCriteria.map((criterion) => ({
    criterionId: criterion.id,
    humanVisibleText: criterion.statement
  }));

  const result = await requestHumanReview({
    agentRunId: values["agent-run-id"],
    brokerBaseUrl,
    criteria,
    dataClass: values["data-class"],
    pollIntervalMs,
    providerAdapter: values.provider,
    reviewerPool: values.pool,
    riskTier,
    screenshot: values.screenshot
      ? {
          caption: values.caption,
          path: values.screenshot,
          viewport: values.viewport
        }
      : undefined,
    template: envelope,
    timeoutMs,
    waitForFeedback: values.wait !== false
  });

  emit({
    agent_next_action: result.feedback?.agent_next_action,
    estimated_cost_usd: result.estimatedCostUsd,
    failed_criteria: result.feedback?.failed_criteria,
    feedback: result.feedback,
    job_id: result.jobId,
    provider_task_id: result.providerTaskId,
    repair_hint: result.feedback?.repair_hint,
    review_task_id: result.reviewTaskId,
    timed_out: result.timedOut
  });
  process.exit(
    result.feedback
      ? (EXIT_BY_ACTION[result.feedback.agent_next_action] ?? 5)
      : 5
  );
}

function parseCriteria(
  values: Record<string, unknown>,
  templateId: ReviewTemplateId
): TemplateCriterion[] {
  if (templateId === "data_extraction_check") {
    const fields = parseFields(values.field as string[] | undefined);
    return fields.map((field) => ({
      id: field.criterion_id,
      statement: `${field.field_name} is recorded as "${field.extracted_value}"`
    }));
  }

  const questions = (values.question as string[] | undefined) ?? [];
  if (questions.length === 0) {
    usageError(
      '--question is required, format "criterion-id:statement" (id optional)'
    );
  }
  return questions.map((question, index) => {
    const separator = question.indexOf(":");
    if (separator > 0 && separator < question.length - 1) {
      return {
        id: question.slice(0, separator).trim(),
        statement: question.slice(separator + 1).trim()
      };
    }
    return { id: `criterion-${index + 1}`, statement: question.trim() };
  });
}

function parseFields(raw: string[] | undefined) {
  if (!raw || raw.length === 0) {
    usageError(
      '--field is required for data_extraction_check, format "name=value" or "criterion-id:name=value"'
    );
  }
  return raw.map((entry) => {
    const equals = entry.indexOf("=");
    if (equals <= 0) {
      usageError(`--field "${entry}" must contain name=value`);
    }
    const left = entry.slice(0, equals);
    const extractedValue = entry.slice(equals + 1);
    const colon = left.indexOf(":");
    const criterionId = colon > 0 ? left.slice(0, colon).trim() : left.trim();
    const fieldName = colon > 0 ? left.slice(colon + 1).trim() : left.trim();
    return {
      criterion_id: criterionId,
      extracted_value: extractedValue,
      field_name: fieldName
    };
  });
}

function buildEnvelope(input: {
  pricing: { max_assignments: number; reward: string };
  templateCriteria: TemplateCriterion[];
  templateId: ReviewTemplateId;
  values: Record<string, unknown>;
}): StructuredTaskTemplate {
  const { pricing, templateCriteria, templateId, values } = input;
  const base = {
    attention_check:
      values["attention-prompt"] && values["attention-expected"]
        ? {
            expected: values["attention-expected"] as string,
            prompt: values["attention-prompt"] as string
          }
        : undefined,
    instructions:
      (values.instructions as string | undefined) ??
      DEFAULT_INSTRUCTIONS[templateId],
    pricing,
    v: 1 as const
  };

  switch (templateId) {
    case "binary_screenshot_check":
      return {
        ...base,
        params: { criteria: templateCriteria },
        template_id: templateId
      };
    case "pairwise_screenshot_compare": {
      const variantA = values["variant-a"] as string | undefined;
      const variantB = values["variant-b"] as string | undefined;
      if (!variantA || !variantB) {
        usageError(
          "--variant-a and --variant-b screenshot paths are required for pairwise_screenshot_compare"
        );
      }
      const candidate = (values.candidate as string | undefined) ?? "b";
      if (candidate !== "a" && candidate !== "b") {
        usageError('--candidate must be "a" or "b"');
      }
      return {
        ...base,
        params: {
          candidate,
          criteria: templateCriteria,
          variant_a: {
            caption: (values["caption-a"] as string | undefined) ?? "Baseline",
            data_url: fileToDataUrl(variantA)
          },
          variant_b: {
            caption: (values["caption-b"] as string | undefined) ?? "Candidate",
            data_url: fileToDataUrl(variantB)
          }
        },
        template_id: templateId
      };
    }
    case "text_quality_rubric":
      return {
        ...base,
        params: {
          content: readContent(values),
          criteria: templateCriteria
        },
        template_id: templateId
      };
    case "data_extraction_check":
      return {
        ...base,
        params: { fields: parseFields(values.field as string[] | undefined) },
        template_id: templateId
      };
    case "instruction_following_check": {
      const spec =
        (values.spec as string | undefined) ??
        (values["spec-file"]
          ? readFileSync(values["spec-file"] as string, "utf8")
          : undefined);
      if (!spec) {
        usageError(
          "--spec or --spec-file is required for instruction_following_check"
        );
      }
      return {
        ...base,
        params: {
          content: readContent(values),
          criteria: templateCriteria,
          instructions_text: spec
        },
        template_id: templateId
      };
    }
  }
}

function readContent(values: Record<string, unknown>): string {
  const content =
    (values.content as string | undefined) ??
    (values["content-file"]
      ? readFileSync(values["content-file"] as string, "utf8")
      : undefined);
  if (!content) {
    usageError("--content or --content-file is required for this template");
  }
  return content;
}

const DATA_URL_MIME: Record<string, string> = {
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp"
};

function fileToDataUrl(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  const mime = DATA_URL_MIME[extension];
  if (!mime) {
    usageError(`Unsupported image extension for ${path}`);
  }
  return `data:${mime};base64,${readFileSync(path).toString("base64")}`;
}

function emit(payload: unknown) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`
  );
  process.exit(70);
});
