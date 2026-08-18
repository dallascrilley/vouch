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
  | "raise_budget_or_accept_fail_closed"
  | "continue_pipeline";

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

// States before any review has been queued. Nothing is blocked in them: the
// caller simply has not taken the next lifecycle step yet. They used to fall
// through to the awaiting_consensus catch-all, which reported a freshly
// created job as stuck and told the operator to post consensus for responses
// that cannot exist yet.
//
// Deliberately excludes external_review_queued and internal_review_queued: a
// queued review reporting awaiting_consensus is intended, and pinned by
// tests/integration/self-verification-escalation.test.ts.
const PRE_REVIEW_STATES: ReadonlySet<VerificationJob["state"]> = new Set([
  "created",
  "artifacts_collected",
  "privacy_classified",
  "self_verifying",
  "decision_point"
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

  // Placed after the budget-blocked check so a real budget signal still wins.
  // The adjudication and pairwise branches below cannot apply here: their
  // states are not pre-review, and a pre-review job has no review task.
  if (
    PRE_REVIEW_STATES.has(job.state) &&
    reviewTasks.length === 0 &&
    responses.length === 0
  ) {
    return {
      stuck: false,
      stuckReason: null,
      recommendedNextAction: "continue_pipeline",
      pairwiseReviewTaskId: null
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
