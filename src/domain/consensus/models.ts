import type { Identifier } from "../shared/types.js";
import type { Severity, ReviewerPool } from "../human-review/models.js";

export type QuorumState = "met" | "needs_more" | "maxed_out";
export type DisagreementLevel = "none" | "low" | "medium" | "high";
export type ConsensusOutcome = "pass" | "fail" | "retry" | "recapture" | "adjudicate" | "fail_closed";
export type AdjudicationDecision = "pass" | "fail" | "retry" | "recapture" | "fail_closed";

export type ConsensusResult = {
  consensusId: Identifier;
  jobId: Identifier;
  reviewTaskId: Identifier;
  validResponseCount: number;
  quorumState: QuorumState;
  criterionProbabilities: Record<string, number>;
  severitySummary: Severity | "none";
  artifactSufficiency: "sufficient" | "insufficient";
  disagreementLevel: DisagreementLevel;
  recommendedOutcome: ConsensusOutcome;
  adjudicationTrigger?: string;
  createdAt: Date;
};

export type AdjudicationCase = {
  adjudicationId: Identifier;
  jobId: Identifier;
  triggerReason: string;
  assignedPool?: ReviewerPool["poolType"];
  normalizedEvidenceRefs: Identifier[];
  decision?: AdjudicationDecision;
  decisionNotes?: string;
  createdAt: Date;
  decidedAt?: Date;
};
