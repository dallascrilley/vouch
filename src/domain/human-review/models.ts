import type { ConfidenceLevel, Identifier, ReviewerPoolType } from "../shared/types.js";
import type { CriterionResult } from "../self-verification/models.js";

export type HumanReviewTaskState =
  | "queued"
  | "dispatched"
  | "responses_received"
  | "consensus_ready"
  | "canceled";

export type HumanReviewTask = {
  reviewTaskId: Identifier;
  jobId: Identifier;
  criterionIds: Identifier[];
  reviewerPool: ReviewerPoolType;
  sanitizedPackageId: Identifier;
  taskTemplate: string;
  qualityPolicy: string;
  paymentPolicy: string;
  deadlineAt: Date;
  providerAdapter?: string;
  providerTaskRef?: string;
  state: HumanReviewTaskState;
};

export type HumanReviewVerdict = "pass" | "fail" | "unclear" | "artifact_insufficient";

export type Severity = "S0" | "S1" | "S2" | "S3" | "S4";

export type HumanResponse = {
  responseId: Identifier;
  reviewTaskId: Identifier;
  providerAssignmentRef?: string;
  reviewerPseudonymousId: string;
  overallVerdict: HumanReviewVerdict;
  criterionResults: CriterionResult[];
  severity: Severity;
  defectCategory: string;
  confidence: ConfidenceLevel;
  artifactIssueFlags: string[];
  evidenceNote: string;
  annotationRefs: Identifier[];
  qualityFlags: string[];
  submittedAt: Date;
};

export type ReviewerPool = {
  reviewerPoolId: Identifier;
  poolType: ReviewerPoolType;
  privacyAllowedClasses: string[];
  qualificationRules: string[];
  goldTaskPolicy: string;
  regionOrLocaleRules: string[];
  paymentPolicy: string;
};

export type ProviderCapabilityProfile = {
  providerId: string;
  supportedPoolTypes: ReviewerPoolType[];
  supportsExternalTaskUrl: boolean;
  supportsStructuredForms: boolean;
  supportsWebhooks: boolean;
  supportsBulkApproval: boolean;
  supportsQualifications: boolean;
  supportsWorkerGroups: boolean;
  privacyLimitations: string[];
  costModel: string;
  latencyProfile: string;
  rateOrLoadConstraints: string[];
};
