import type { ConsensusResult } from "../consensus/models.js";
import type { VerdictLedgerEvent } from "../feedback/models.js";
import type { HumanResponse, HumanReviewTask } from "../human-review/models.js";
import { isPairwiseTieBreakTemplate } from "../human-review/provider-workflow-service.js";
import type { VerificationJob } from "./models.js";

export type StuckReason =
  | "awaiting_consensus"
  | "ambiguous_callback"
  | "budget_blocked"
  | "pairwise_pending"
  | "adjudication_required";

export type RecommendedNextAction =
  | "fetch_feedback"
  | "post_consensus"
  | "await_pairwise_tie_break"
  | "post_adjudication"
  | "raise_budget_or_accept_fail_closed";

export type StuckState = {
  stuck: boolean;
  stuckReason: StuckReason | null;
  recommendedNextAction: RecommendedNextAction | null;
  pairwiseReviewTaskId: string | null;
};

const TERMINAL_STATES: ReadonlySet<VerificationJob["state"]> = new Set([
  "final_pass",
  "final_fail",
  "fail_closed",
  "canceled",
  "agent_retry_requested",
  "artifact_recapture_requested"
]);

export function deriveStuckState(input: {
  consensus: ConsensusResult | null;
  job: VerificationJob;
  ledger: VerdictLedgerEvent[];
  responses: HumanResponse[];
  reviewTasks: HumanReviewTask[];
}): StuckState {
  const { consensus, job, ledger, responses, reviewTasks } = input;

  if (TERMINAL_STATES.has(job.state)) {
    return {
      stuck: false,
      stuckReason: null,
      recommendedNextAction: "fetch_feedback",
      pairwiseReviewTaskId: null
    };
  }

  const pairwiseTask =
    reviewTasks.find((task) => isPairwiseTieBreakTemplate(task.taskTemplate)) ??
    null;

  if (
    ledger.some((event) => event.eventType === "verification.budget.blocked")
  ) {
    return {
      stuck: true,
      stuckReason: "budget_blocked",
      recommendedNextAction: "raise_budget_or_accept_fail_closed",
      pairwiseReviewTaskId: pairwiseTask?.reviewTaskId ?? null
    };
  }

  const consensusEscalated =
    job.state === "consensus_running" &&
    Boolean(consensus?.adjudicationTrigger);

  if (job.state === "adjudication_required" || consensusEscalated) {
    return {
      stuck: true,
      stuckReason: "adjudication_required",
      recommendedNextAction: "post_adjudication",
      pairwiseReviewTaskId: pairwiseTask?.reviewTaskId ?? null
    };
  }

  if (pairwiseTask) {
    return {
      stuck: true,
      stuckReason: "pairwise_pending",
      recommendedNextAction: "await_pairwise_tie_break",
      pairwiseReviewTaskId: pairwiseTask.reviewTaskId
    };
  }

  const distinctVerdicts = new Set(
    responses.map((response) => response.overallVerdict)
  );
  const hasAmbiguousSignal =
    responses.some((response) => response.overallVerdict === "unclear") ||
    distinctVerdicts.size > 1;

  if (responses.length > 0 && hasAmbiguousSignal) {
    return {
      stuck: true,
      stuckReason: "ambiguous_callback",
      recommendedNextAction: "post_consensus",
      pairwiseReviewTaskId: null
    };
  }

  return {
    stuck: true,
    stuckReason: "awaiting_consensus",
    recommendedNextAction: "post_consensus",
    pairwiseReviewTaskId: null
  };
}
