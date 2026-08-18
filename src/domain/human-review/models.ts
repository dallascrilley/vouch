import type {
  ConfidenceLevel,
  Identifier,
  ReviewerPoolType
} from "../shared/types.js";
import type { CriterionResult } from "../self-verification/models.js";

export type HumanReviewTaskState =
  | "queued"
  | "dispatched"
  | "responses_received"
  | "consensus_ready"
  | "canceled";

export type HumanReviewTask = {
  idempotencyKey?: string;
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
  visualEvidence?: VisualEvidence;
};

export type VisualEvidence = {
  artifactId: Identifier;
  caption: string;
  contentHash: string;
  dataUrl: string;
  viewport: string;
};

export type ProviderDispatchMode = "api" | "mock";
export type ProviderIngestionMode = "callback" | "polling";

export type ProviderAdapterConfig = {
  providerId: string;
  credentialSource: string;
  accountScope: string;
  dispatchMode: ProviderDispatchMode;
  ingestionMode: ProviderIngestionMode;
  callbackBaseUrl?: string;
  dispatchUrl?: string;
  enabled: boolean;
  apiKey?: string;
  sharedSecret?: string;
  dispatchTimeoutMs?: number;
  fallbackProviderId: string;
};

export type ProviderTaskMappingStatus =
  | "queued"
  | "dispatched"
  | "delivered"
  | "normalized"
  | "fallback"
  | "blocked";

export type ProviderTaskMapping = {
  reviewTaskId: Identifier;
  providerId: string;
  providerTaskId: string;
  providerAssignmentScope: string;
  dispatchStatus: ProviderTaskMappingStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type ProviderResponseReceipt = {
  receiptId: Identifier;
  providerId: string;
  providerTaskId: string;
  providerResponseId: string;
  deliveryMode: ProviderIngestionMode;
  receivedAt: Date;
  normalizedResponseId?: Identifier;
  dedupeKey: string;
};

export type ProviderHealthStatus = "healthy" | "degraded" | "down";

export type ProviderHealthState = {
  providerId: string;
  status: ProviderHealthStatus;
  lastSuccessAt?: Date;
  lastFailureAt?: Date;
  failureReason?: string;
  fallbackRoute: ReviewerPoolType;
};

export type LocalProviderValidationProfile = {
  providerId: string;
  validationCommandSet: string[];
  requiredLocalEnv: string[];
  expectedDispatchEvidence: string[];
  expectedIngestionEvidence: string[];
};

export type HumanReviewVerdict =
  | "pass"
  | "fail"
  | "unclear"
  | "artifact_insufficient";

export type Severity = "S0" | "S1" | "S2" | "S3" | "S4";

export type HumanResponse = {
  responseId: Identifier;
  reviewTaskId: Identifier;
  providerId?: string;
  providerResponseId?: string;
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
