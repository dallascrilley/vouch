import { createHash } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, sep } from "node:path";

import type {
  ExtensionAPI,
  ExtensionContext
} from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";

import type { StructuredTaskTemplate } from "../../../scripts/lib/review-templates.js";
import { classifyArtifact } from "./classify-artifact.js";
import type {
  BrokerConnection,
  BrokerSupervisor
} from "./broker-supervisor.js";
import type {
  PiReviewClient,
  ReviewEnvelope,
  ReviewInput
} from "./review-client.js";
import type { ReviewUi } from "./ui.js";

const TEMPLATE_IDS = [
  "binary_screenshot_check",
  "text_quality_rubric",
  "instruction_following_check"
] as const;

const CriteriaSchema = Type.Array(
  Type.Object({
    criterion_id: Type.String({
      description: "Stable identifier for the check."
    }),
    criticality: Type.Optional(
      StringEnum(["critical", "major", "minor", "audit"] as const)
    ),
    statement: Type.String({ description: "What the reviewer should verify." })
  })
);

export const HumanReviewParameters = Type.Object({
  criteria: CriteriaSchema,
  data_class: Type.Optional(
    StringEnum([
      "public",
      "internal_low",
      "sensitive_internal",
      "regulated_or_secret"
    ] as const)
  ),
  force_new: Type.Optional(Type.Boolean()),
  reviewer_pool: Type.Optional(
    StringEnum(["managed", "internal", "public_crowd"] as const)
  ),
  risk_tier: Type.Optional(StringEnum(["low", "medium", "high"] as const)),
  screenshot_path: Type.Optional(Type.String()),
  text: Type.Optional(
    Type.String({ description: "The text or work product to review." })
  ),
  template_id: StringEnum(TEMPLATE_IDS),
  timeout_ms: Type.Optional(Type.Integer({ minimum: 100, maximum: 1_800_000 }))
});

export const ReviewHandleParameters = Type.Object({
  handle: Type.String()
});

type HumanReviewParams = Static<typeof HumanReviewParameters>;
type ReviewHandleParams = Static<typeof ReviewHandleParameters>;

export type ReviewToolRuntime = {
  client: Pick<PiReviewClient, "list" | "review" | "status">;
  supervisor: Pick<
    BrokerSupervisor,
    "ensureRunning" | "isLive" | "startBridge"
  >;
  defaultTimeoutMs?: number;
  uiFactory?: (ctx: ExtensionContext) => ReviewUi;
};

function safeScreenshotPath(path: string, workspaceRoot: string): string {
  const resolvedRoot = realpathSync(workspaceRoot);
  const resolvedPath = realpathSync(path);
  const rel = relative(resolvedRoot, resolvedPath);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error("screenshot_path must remain inside the active workspace");
  }
  if (!statSync(resolvedPath).isFile()) {
    throw new Error("screenshot_path must point to a regular file");
  }
  return resolvedPath;
}

function hashReviewContent(
  params: HumanReviewParams,
  workspaceRoot: string
): string {
  if (params.screenshot_path) {
    return createHash("sha256")
      .update(
        readFileSync(safeScreenshotPath(params.screenshot_path, workspaceRoot))
      )
      .digest("hex");
  }
  if (params.text !== undefined) {
    return createHash("sha256").update(params.text).digest("hex");
  }
  throw new Error(
    "human_review requires text or screenshot_path; criteria alone do not identify the work under review"
  );
}

function buildTemplate(params: HumanReviewParams): StructuredTaskTemplate {
  if (
    params.template_id === "binary_screenshot_check" &&
    !params.screenshot_path
  ) {
    throw new Error("binary_screenshot_check reviews require screenshot_path");
  }
  const criteria = params.criteria.map((criterion) => ({
    id: criterion.criterion_id,
    statement: criterion.statement
  }));
  const common = {
    instructions: "Review only what is present in the supplied evidence.",
    v: 1 as const
  };
  if (params.template_id === "text_quality_rubric") {
    const content = params.text;
    if (content === undefined) {
      throw new Error("text is required for text_quality_rubric reviews");
    }
    return {
      ...common,
      params: {
        content,
        criteria
      },
      template_id: params.template_id
    };
  }
  if (params.template_id === "instruction_following_check") {
    const content = params.text;
    if (content === undefined) {
      throw new Error(
        "text is required for instruction_following_check reviews"
      );
    }
    return {
      ...common,
      params: {
        content,
        criteria,
        instructions_text: "Check each statement against the supplied work."
      },
      template_id: params.template_id
    };
  }
  return {
    ...common,
    params: { criteria },
    template_id: "binary_screenshot_check"
  };
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function resultForAgent(
  envelope: ReviewEnvelope
): AgentToolResult<ReviewEnvelope> {
  return {
    content: [{ type: "text", text: asText(envelope) }],
    details: envelope
  };
}

async function connection(
  runtime: ReviewToolRuntime
): Promise<BrokerConnection> {
  const broker = await runtime.supervisor.ensureRunning();
  if (runtime.supervisor.isLive) {
    await runtime.supervisor.startBridge();
  }
  return broker;
}

export function registerReviewTools(
  pi: ExtensionAPI,
  runtime: ReviewToolRuntime
): void {
  pi.registerTool({
    description:
      "Run one human review of the supplied criteria and artifacts. Return the settled verdict or an ambient handle.",
    execute: async (
      _toolCallId,
      params: HumanReviewParams,
      signal,
      onUpdate,
      _ctx: ExtensionContext
    ) => {
      const ui = runtime.uiFactory?.(_ctx);
      try {
        if (signal?.aborted)
          throw new Error("Human review was aborted before dispatch");
        const broker = await connection(runtime);
        const reviewerPool = params.reviewer_pool ?? "managed";
        const workspaceRoot = _ctx.cwd ?? process.cwd();
        const screenshotPath = params.screenshot_path
          ? safeScreenshotPath(params.screenshot_path, workspaceRoot)
          : undefined;
        const input: ReviewInput = {
          agentControlled: true,
          brokerBaseUrl: broker.baseUrl,
          contentHash: hashReviewContent(params, workspaceRoot),
          contentSource: screenshotPath
            ? { kind: "file", path: screenshotPath }
            : undefined,
          criteria: params.criteria.map((criterion) => ({
            criterionId: criterion.criterion_id,
            criticality: criterion.criticality,
            humanVisibleText: criterion.statement
          })),
          dataClass: classifyArtifact(params.data_class),
          forceNew: params.force_new,
          operatorToken: broker.operatorToken,
          reviewerPool,
          riskTier: params.risk_tier ?? "medium",
          screenshot: screenshotPath ? { path: screenshotPath } : undefined,
          simulated: broker.simulated,
          signal,
          template: buildTemplate(params),
          templateId: params.template_id,
          timeoutMs: params.timeout_ms ?? runtime.defaultTimeoutMs ?? 5_000,
          workspaceRef: workspaceRoot
        };
        onUpdate?.({
          content: [
            { type: "text", text: "Review dispatched; waiting for verdict…" }
          ],
          details: { status: "ambient", simulated: input.simulated }
        });
        const envelope = await runtime.client.review(input);
        ui?.update(envelope);
        if (envelope.status === "settled") ui?.reveal(envelope);
        return resultForAgent(envelope);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: JSON.stringify({ error: message }) }],
          isError: true,
          details: []
        };
      }
    },
    label: "Human review",
    name: "human_review",
    parameters: HumanReviewParameters,
    promptSnippet: "Review criteria and artifacts with Vouch.",
    renderShell: "default"
  });

  pi.registerTool({
    description: "Read the current verdict for a known Vouch review handle.",
    execute: async (
      _toolCallId,
      params: ReviewHandleParams,
      _signal,
      _onUpdate,
      _ctx: ExtensionContext
    ) => {
      void _toolCallId;
      void _onUpdate;
      void _ctx;
      try {
        const broker = await connection(runtime);
        return resultForAgent(
          await runtime.client.status(params.handle, {
            brokerBaseUrl: broker.baseUrl,
            operatorToken: broker.operatorToken,
            signal: _signal
          })
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: JSON.stringify({ error: message }) }],
          isError: true,
          details: {
            blockingReasons: [message],
            simulated: false,
            status: "not_reviewed"
          }
        };
      }
    },
    label: "Review status",
    name: "review_status",
    parameters: ReviewHandleParameters,
    promptSnippet: "Read a known review handle.",
    renderShell: "default"
  });

  pi.registerTool({
    description:
      "List locally tracked reviews and pull any verdicts that have arrived.",
    execute: async () => {
      try {
        const broker = await connection(runtime);
        const reviews = [] as ReviewEnvelope[];
        const retentionCutoff = Date.now() - 24 * 60 * 60_000;
        const records = runtime.client.list().filter((record) => {
          const envelope = record.envelope;
          if (
            !envelope ||
            (envelope.status !== "settled" &&
              envelope.status !== "not_reviewed" &&
              !envelope.expired)
          ) {
            return true;
          }
          return (
            !record.surfacedAt ||
            Date.parse(record.surfacedAt) >= retentionCutoff
          );
        });
        for (const record of records) {
          if (
            record.envelope?.status === "settled" ||
            record.envelope?.status === "not_reviewed" ||
            record.envelope?.expired
          ) {
            reviews.push(record.envelope);
            continue;
          }
          reviews.push(
            await runtime.client.status(record.handle, {
              brokerBaseUrl: broker.baseUrl,
              operatorToken: broker.operatorToken
            })
          );
        }
        return {
          content: [{ type: "text", text: JSON.stringify(reviews) }],
          details: reviews
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: JSON.stringify({ error: message }) }],
          isError: true,
          details: []
        };
      }
    },
    label: "Pending reviews",
    name: "list_pending_reviews",
    parameters: Type.Object({}),
    promptSnippet: "List tracked reviews with newly arrived verdicts.",
    renderShell: "default"
  });
}
