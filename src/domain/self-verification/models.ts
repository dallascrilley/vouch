import type { AcceptanceCriterion } from "../jobs/models.js";
import type { ArtifactQuality } from "../artifacts/models.js";
import type { ConfidenceLevel, Identifier } from "../shared/types.js";

export type RecommendedAction =
  | "pass"
  | "fail"
  | "retry"
  | "recapture"
  | "human_review"
  | "internal_review"
  | "fail_closed";

export type CriterionResult = Pick<
  AcceptanceCriterion,
  "criterionId" | "status"
> & {
  confidence: ConfidenceLevel;
};

export type SelfVerificationChecks = {
  artifactQuality: ArtifactQuality;
  visual: string[];
  text: string[];
  layout: string[];
  accessibility: string[];
  runtime: string[];
  trace: string[];
};

export type SelfVerificationResult = {
  resultId: Identifier;
  jobId: Identifier;
  criterionResults: CriterionResult[];
  checks: SelfVerificationChecks;
  confidence: ConfidenceLevel;
  recommendedAction: RecommendedAction;
  failureCategories: string[];
  createdAt: Date;
};
