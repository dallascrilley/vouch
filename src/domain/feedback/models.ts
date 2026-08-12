import type { Identifier, ConfidenceLevel } from "../shared/types.js";
import type { CriterionResult } from "../self-verification/models.js";
import type { Severity } from "../human-review/models.js";

export type FinalVerdictState =
  | "pass"
  | "fail"
  | "unclear"
  | "retry"
  | "recapture"
  | "fail_closed";
export type ReleaseGateEffect =
  | "allow"
  | "block"
  | "needs_review"
  | "no_effect";
export type AgentNextAction =
  | "pass"
  | "fail"
  | "retry"
  | "recapture"
  | "escalate";

export type FinalVerdict = {
  verdictId: Identifier;
  jobId: Identifier;
  finalVerdict: FinalVerdictState;
  criterionOutcomes: CriterionResult[];
  confidence: ConfidenceLevel;
  maxSeverity: Severity | "none";
  evidenceRefs: Identifier[];
  humanConsensusSummary?: string;
  adjudicationSummary?: string;
  cost?: number;
  latencySeconds?: number;
  retryRecommendation?: string;
  releaseGateEffect: ReleaseGateEffect;
  createdAt: Date;
};

export type AgentFeedbackSignal = {
  feedbackId: Identifier;
  jobId: Identifier;
  finalVerdict: FinalVerdictState;
  agentNextAction: AgentNextAction;
  failedCriteria: Identifier[];
  severity?: Severity;
  defectCategory?: string;
  evidencePointers: Identifier[];
  humanAnnotations: Identifier[];
  machineCheckFailures: string[];
  retryAllowed: boolean;
  retryReason?: string;
  repairHint?: string;
  budgetState?: string;
  policyConstraints: string[];
  providerIds?: string[];
  providerResponseIds?: Identifier[];
};

export type VerdictLedgerEvent = {
  eventId: Identifier;
  jobId: Identifier;
  eventType: string;
  actorType: "system" | "agent" | "reviewer" | "adjudicator" | "provider";
  occurredAt: Date;
  payloadHash: string;
  artifactHashes: string[];
  policyVersion: string;
  costDelta?: number;
  correlationId: Identifier;
};
