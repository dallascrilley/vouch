import type { Identifier, ReviewerPoolType } from "../shared/types.js";

export type DataClass =
  | "public"
  | "internal_low"
  | "sensitive_internal"
  | "regulated_or_secret";

export type RedactionStatus =
  | "not_required"
  | "completed"
  | "failed"
  | "insufficient_confidence";

export type ExternalizationDecision =
  | "allowed"
  | "internal_only"
  | "managed_only"
  | "blocked_fail_closed"
  | "recapture_required";

export type PrivacyClassification = {
  classificationId: Identifier;
  jobId: Identifier;
  artifactManifestId: Identifier;
  dataClass: DataClass;
  redactionStatus: RedactionStatus;
  allowedReviewerRoutes: ReviewerPoolType[];
  blockedReasons: string[];
  policyVersion: string;
  externalizationDecision: ExternalizationDecision;
  auditRecordId: Identifier;
};
