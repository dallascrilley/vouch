# Data Model: SQLite Local Runtime

## RuntimeStoreConfig

Represents the local configuration for durable state and evidence paths.

**Fields**

- `database_path`
- `artifact_root`
- `queue_claim_ttl_seconds`
- `migration_version`
- `validation_profile`

## PersistedVerificationJob

Durable SQLite record for one verification job.

**Fields**

- `job_id`
- `idempotency_key`
- `agent_run_id`
- `parent_job_id`
- `source_json`
- `risk_tier`
- `state`
- `deadline_at`
- `budget_policy_json`
- `artifact_manifest_id`
- `created_at`
- `updated_at`
- `closed_at`

## PersistedAcceptanceCriterion

Durable criterion record linked to a verification job.

**Fields**

- `criterion_id`
- `job_id`
- `human_visible_text`
- `criticality`
- `evidence_requirements_json`
- `pass_threshold`
- `status`

## PersistedArtifactManifest

SQLite metadata record for attached evidence and its local storage references.

**Fields**

- `manifest_id`
- `job_id`
- `artifact_quality`
- `environment_json`
- `artifact_refs_json`
- `sanitized_package_refs_json`
- `created_at`

## PersistedReviewTask

Durable local record of a review task routed to internal review or provider simulation.

**Fields**

- `review_task_id`
- `job_id`
- `criterion_ids_json`
- `reviewer_pool`
- `sanitized_package_id`
- `task_template`
- `quality_policy`
- `payment_policy`
- `provider_adapter`
- `state`
- `deadline_at`

## PersistedReviewResponse

Durable normalized reviewer response record.

**Fields**

- `response_id`
- `review_task_id`
- `reviewer_pseudonymous_id`
- `overall_verdict`
- `criterion_results_json`
- `severity`
- `defect_category`
- `confidence`
- `artifact_issue_flags_json`
- `quality_flags_json`
- `submitted_at`

## PersistedConsensusResult

Durable consensus record for a review task and job.

**Fields**

- `consensus_id`
- `job_id`
- `review_task_id`
- `valid_response_count`
- `quorum_state`
- `criterion_probabilities_json`
- `severity_summary`
- `artifact_sufficiency`
- `disagreement_level`
- `recommended_outcome`
- `adjudication_trigger`
- `created_at`

## PersistedAdjudicationCase

Durable adjudication decision record.

**Fields**

- `adjudication_id`
- `job_id`
- `trigger_reason`
- `assigned_pool`
- `normalized_evidence_refs_json`
- `decision`
- `decision_notes`
- `created_at`
- `decided_at`

## PersistedFinalVerdict

Durable final verdict record.

**Fields**

- `verdict_id`
- `job_id`
- `final_verdict`
- `criterion_outcomes_json`
- `confidence`
- `max_severity`
- `evidence_refs_json`
- `retry_recommendation`
- `release_gate_effect`
- `created_at`

## PersistedFeedbackSignal

Durable machine-readable feedback record.

**Fields**

- `feedback_id`
- `job_id`
- `final_verdict`
- `failed_criteria_json`
- `defect_category`
- `machine_check_failures_json`
- `retry_allowed`
- `retry_reason`
- `repair_hint`
- `policy_constraints_json`
- `created_at`

## PersistedLedgerEvent

Append-only SQLite ledger record.

**Fields**

- `event_id`
- `job_id`
- `event_type`
- `actor_type`
- `occurred_at`
- `payload_hash`
- `artifact_hashes_json`
- `policy_version`
- `cost_delta`
- `correlation_id`

## LocalQueueClaim

Represents locally persisted work that may survive restart.

**Fields**

- `claim_id`
- `job_name`
- `job_id`
- `payload_json`
- `state`
- `claimed_at`
- `available_at`
- `attempt_count`
