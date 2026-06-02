export type Identifier = string;

export type ConfidenceLevel = "low" | "medium" | "high";

export type RiskTier =
  | "low"
  | "medium"
  | "high"
  | "regulated"
  | "release_gating";

export type ReviewerPoolType =
  | "public_crowd"
  | "qualified_crowd"
  | "internal"
  | "managed"
  | "domain_expert";

export type JobState =
  | "created"
  | "artifacts_collected"
  | "privacy_classified"
  | "self_verifying"
  | "decision_point"
  | "external_review_queued"
  | "internal_review_queued"
  | "human_responses_received"
  | "consensus_running"
  | "adjudication_required"
  | "final_pass"
  | "final_fail"
  | "agent_retry_requested"
  | "artifact_recapture_requested"
  | "fail_closed"
  | "canceled";
