import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

import type {
  ExtensionAPI,
  ExtensionCommandContext
} from "@earendil-works/pi-coding-agent";

import type { BrokerSupervisor } from "./broker-supervisor.js";
import type {
  PiReviewClient,
  ReviewEnvelope,
  ReviewInput
} from "./review-client.js";

export type ReviewWidgetState = {
  blockedReason?: string;
  handle: string;
  quorumReached?: boolean;
  responsesReceived?: number;
  simulated: boolean;
  stale?: boolean;
  status:
    | "ambient"
    | "bridge-down"
    | "dispatched"
    | "expired"
    | "vouch"
    | "settled"
    | "spend-blocked"
    | "stale"
    | "stuck"
    | "not-reviewed";
};

function statusForEnvelope(
  envelope: ReviewEnvelope
): ReviewWidgetState["status"] {
  if (envelope.stale) return "stale";
  if (envelope.expired) return "expired";
  if (envelope.blockingReasons?.some((reason) => reason.includes("spend"))) {
    return "spend-blocked";
  }
  if (envelope.stuckState) return "stuck";
  if (envelope.status === "not_reviewed") return "not-reviewed";
  if (envelope.status === "settled") return "settled";
  return "ambient";
}

export function renderReviewWidget(states: ReviewWidgetState[]): string[] {
  if (states.length === 0) return [];
  return [
    "Vouch reviews",
    ...states.map((state) => {
      const provenance = state.simulated ? "SIMULATED" : "REAL";
      const responseCount = state.responsesReceived
        ? ` · ${state.responsesReceived} response${state.responsesReceived === 1 ? "" : "s"}`
        : "";
      const suffix = state.blockedReason ? ` — ${state.blockedReason}` : "";
      return `${state.handle} · ${state.status.toUpperCase()} · ${provenance}${responseCount}${suffix}`;
    })
  ];
}

export class ReviewUi {
  private readonly states = new Map<string, ReviewWidgetState>();
  private streak = 0;

  constructor(
    private readonly ui: {
      notify(message: string, type?: "info" | "warning" | "error"): void;
      setStatus(key: string, text: string | undefined): void;
      setWidget(
        key: string,
        content: string[] | undefined,
        options?: { placement?: "aboveEditor" | "belowEditor" }
      ): void;
    }
  ) {}

  update(envelope: ReviewEnvelope): void {
    if (!envelope.handle) return;
    const state: ReviewWidgetState = {
      blockedReason: envelope.blockingReasons?.[0],
      handle: envelope.handle,
      simulated: envelope.simulated,
      stale: envelope.stale,
      status: statusForEnvelope(envelope)
    };
    this.states.set(envelope.handle, state);
    this.render();
  }

  updateProgress(
    handle: string,
    progress: Pick<ReviewWidgetState, "responsesReceived" | "quorumReached"> &
      Partial<Pick<ReviewWidgetState, "status" | "simulated">>
  ): void {
    const current = this.states.get(handle) ?? {
      handle,
      simulated: progress.simulated ?? true,
      status: "dispatched" as const
    };
    this.states.set(handle, { ...current, ...progress });
    this.render();
  }

  reveal(envelope: ReviewEnvelope): void {
    this.update(envelope);
    if (!envelope.handle || !envelope.agent_next_action) return;
    if (envelope.agent_next_action === "pass") this.streak += 1;
    else this.streak = 0;
    const provenance = envelope.simulated ? "SIMULATED" : "REAL";
    this.ui.setStatus(
      "vouch",
      `${envelope.agent_next_action}${this.streak > 1 ? ` · ${this.streak} in a row` : ""}`
    );
    this.ui.notify(
      `✨ Vouch verdict: ${envelope.agent_next_action.toUpperCase()} · ${provenance}`,
      envelope.stale ? "warning" : "info"
    );
  }

  private render(): void {
    const content = renderReviewWidget([...this.states.values()]);
    this.ui.setWidget("vouch-reviews", content.length ? content : undefined, {
      placement: "aboveEditor"
    });
  }
}

type ReviewCommandDeps = {
  client: Pick<PiReviewClient, "review">;
  supervisor: Pick<BrokerSupervisor, "ensureRunning">;
  ui?: ReviewUi;
  uiFactory?: (ctx: ExtensionCommandContext) => ReviewUi;
};

function currentDiff(cwd: string): string {
  try {
    return execFileSync("git", ["diff", "--binary", "HEAD", "--"], {
      cwd,
      encoding: "utf8",
      maxBuffer: 2_000_000
    });
  } catch {
    return "";
  }
}

export function registerReviewCommand(
  pi: ExtensionAPI,
  deps: ReviewCommandDeps
): void {
  pi.registerCommand("vouch-review", {
    description: "Review the current work product with Vouch.",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const diff = currentDiff(ctx.cwd);
      if (!diff && !args.trim()) {
        ctx.ui.notify(
          "/vouch-review found no uncommitted diff; pass a review statement.",
          "warning"
        );
        return;
      }
      const statement =
        args.trim() || "The current work product is ready to ship.";
      const broker = await deps.supervisor.ensureRunning();
      if (!args.trim() && ctx.hasUI) {
        const reviewerKind = broker.simulated ? "simulated" : "real";
        const confirmed = await ctx.ui.confirm(
          "Review current diff",
          `Send the uncommitted work product to Vouch's ${reviewerKind} reviewers?`
        );
        if (!confirmed) return;
      }
      const content = args.trim() || diff;
      const criterion = {
        criterionId: "current-work-product",
        humanVisibleText: statement
      };
      const input: ReviewInput = {
        agentControlled: true,
        brokerBaseUrl: broker.baseUrl,
        contentHash: createHash("sha256").update(content).digest("hex"),
        contentSource: args.trim() ? undefined : { kind: "git_diff" },
        criteria: [criterion],
        dataClass: "internal_low",
        operatorToken: broker.operatorToken,
        simulated: broker.simulated,
        template: {
          instructions: "Read the work product and answer the criterion.",
          params: {
            content,
            criteria: [{ id: criterion.criterionId, statement }]
          },
          template_id: "text_quality_rubric",
          v: 1
        },
        templateId: "text_quality_rubric",
        workspaceRef: ctx.cwd
      };
      const envelope = await deps.client.review(input);
      const ui = deps.uiFactory?.(ctx) ?? deps.ui;
      ui?.update(envelope);
      if (envelope.status === "settled") ui?.reveal(envelope);
      else if (envelope.status === "not_reviewed")
        ctx.ui.notify(
          `Review was not sent: ${envelope.blockingReasons?.[0] ?? "policy blocked"}`,
          "warning"
        );
      else
        ctx.ui.notify(
          `Review is ambient: ${envelope.handle ?? "unknown handle"}`,
          "info"
        );
    }
  });
}
