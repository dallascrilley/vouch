# Data Model: Verification Control Plane

## VerificationJob

Represents one request to verify an agent or release outcome.

**Fields**

- `job_id`: stable unique identifier
- `idempotency_key`: caller-provided duplicate-prevention key
- `agent_run_id`: source agent run or CI run
- `parent_job_id`: previous job when this is a retry or recapture
- `source`: repository, branch, commit, build, environment, tenant, feature flags
- `risk_tier`: `low`, `medium`, `high`, `regulated`, `release_gating`
- `state`: lifecycle state
- `deadline_at`: latest acceptable decision time
- `budget_policy_id`: applied budget policy
- `acceptance_criteria`: associated criteria
- `artifact_manifest_id`: associated artifact bundle
- `created_at`, `updated_at`, `closed_at`

**Validation Rules**

- `job_id`, `idempotency_key`, `source`, `risk_tier`, and at least one acceptance criterion are required.
- Duplicate `idempotency_key` for the same source returns the existing active job.
- Public external review is disallowed when `risk_tier` is `regulated` or evidence classification blocks public review.

**State Transitions**

`created` -> `artifacts_collected` -> `privacy_classified` -> `self_verifying` -> `decision_point` -> one of `final_pass`, `final_fail`, `agent_retry_requested`, `artifact_recapture_requested`, `external_review_queued`, `internal_review_queued`, `adjudication_required`, `fail_closed`, `canceled`.

External/internal review states can move to `human_responses_received`, `consensus_running`, `adjudication_required`, and then a terminal verdict.

## AcceptanceCriterion

Represents an observable requirement for verification.

**Fields**

- `criterion_id`
- `job_id`
- `human_visible_text`
- `criticality`: `critical`, `major`, `minor`, `audit`
- `evidence_requirements`: required artifact types or regions
- `pass_threshold`: confidence or consensus threshold
- `status`: `pending`, `pass`, `fail`, `unclear`, `not_visible`

**Validation Rules**

- Criteria must be observable and testable.
- Critical criteria require evidence mapping before terminal pass.
- Subjective wording must be rejected or rewritten before dispatch.

## ArtifactManifest

Records raw internal artifacts and derived sanitized packages.

**Fields**

- `manifest_id`
- `job_id`
- `raw_artifacts`: artifact references with type, hash, provenance, environment, timestamp
- `sanitized_packages`: derived package references with transform lineage
- `artifact_quality`: `sufficient`, `blank`, `loading`, `cropped`, `too_redacted`, `missing_required_evidence`
- `environment`: domain, route, tenant, user type, viewport, locale, timezone
- `created_at`

**Validation Rules**

- Every artifact reference requires a content hash and provenance.
- Raw artifacts stay internal by default.
- Sanitized packages require a completed privacy classification and transform lineage.

## PrivacyClassification

Captures data classification and externalization decision.

**Fields**

- `classification_id`
- `job_id`
- `artifact_manifest_id`
- `data_class`: `public`, `internal_low`, `sensitive_internal`, `regulated_or_secret`
- `redaction_status`: `not_required`, `completed`, `failed`, `insufficient_confidence`
- `allowed_reviewer_routes`: public crowd, qualified crowd, internal, managed, domain expert
- `blocked_reasons`
- `policy_version`
- `externalization_decision`: `allowed`, `internal_only`, `managed_only`, `blocked_fail_closed`, `recapture_required`
- `audit_record_id`

**Validation Rules**

- No human review package can be dispatched without an allowed route.
- Public crowd route requires low-risk classification and completed redaction.
- Redaction failure results in internal-only review or fail-closed behavior.

## SelfVerificationResult

Automated verification result for the job.

**Fields**

- `result_id`
- `job_id`
- `criterion_results`: per-criterion status and confidence
- `checks`: artifact sufficiency, visual, text, layout, accessibility-relevant, runtime, trace/log summary
- `confidence`: `low`, `medium`, `high`
- `recommended_action`: pass, fail, retry, recapture, human review, internal review, fail closed
- `failure_categories`
- `created_at`

**Validation Rules**

- High-confidence pass requires all critical criteria passing and sufficient artifacts.
- Critical deterministic failures cannot be overridden by public human review without policy-approved adjudication.

## HumanReviewTask

A sanitized task package for reviewers.

**Fields**

- `review_task_id`
- `job_id`
- `criterion_ids`
- `reviewer_pool`
- `sanitized_package_id`
- `task_template`
- `quality_policy`
- `payment_policy`
- `deadline_at`
- `provider_adapter`
- `provider_task_ref`
- `state`

**Validation Rules**

- Task cannot reference raw artifacts.
- Task wording must ask observable questions only.
- Provider adapter must declare support for required reviewer pool, quality policy, callback/collection method, and answer schema.

## HumanResponse

One reviewer's structured response.

**Fields**

- `response_id`
- `review_task_id`
- `provider_assignment_ref`
- `reviewer_pseudonymous_id`
- `overall_verdict`: pass, fail, unclear, artifact insufficient
- `criterion_results`
- `severity`: S0, S1, S2, S3, S4
- `defect_category`
- `confidence`: low, medium, high
- `artifact_issue_flags`
- `evidence_note`
- `annotation_refs`
- `quality_flags`
- `submitted_at`

**Validation Rules**

- Required fields must be present before inclusion in consensus.
- Contradictory severity/verdict combinations are rejected or downweighted.
- Disagreement with final verdict is not a rejection reason by itself.

## ReviewerPool

Eligibility and policy for a reviewer group.

**Fields**

- `reviewer_pool_id`
- `pool_type`: public crowd, qualified crowd, internal, managed, domain expert
- `privacy_allowed_classes`
- `qualification_rules`
- `gold_task_policy`
- `region_or_locale_rules`
- `payment_policy`

## ProviderCapabilityProfile

Adapter-declared capabilities.

**Fields**

- `provider_id`
- `supported_pool_types`
- `supports_external_task_url`
- `supports_structured_forms`
- `supports_webhooks`
- `supports_bulk_approval`
- `supports_qualifications`
- `supports_worker_groups`
- `privacy_limitations`
- `cost_model`
- `latency_profile`
- `rate_or_load_constraints`

## ConsensusResult

Aggregated outcome from reviewer responses.

**Fields**

- `consensus_id`
- `job_id`
- `review_task_id`
- `valid_response_count`
- `quorum_state`: met, needs_more, maxed_out
- `criterion_probabilities`
- `severity_summary`
- `artifact_sufficiency`
- `disagreement_level`
- `recommended_outcome`
- `adjudication_trigger`
- `created_at`

**Validation Rules**

- Severe credible minority reports trigger adjudication for release-gating or high-risk jobs.
- Artifact-insufficient consensus requests recapture or internal review rather than product failure.

## AdjudicationCase

Separate review path for disputed or high-risk outcomes.

**Fields**

- `adjudication_id`
- `job_id`
- `trigger_reason`
- `assigned_pool`
- `normalized_evidence_refs`
- `decision`: pass, fail, retry, recapture, fail closed
- `decision_notes`
- `created_at`, `decided_at`

## FinalVerdict

Authoritative job outcome.

**Fields**

- `verdict_id`
- `job_id`
- `final_verdict`: pass, fail, unclear, retry, recapture, fail closed
- `criterion_outcomes`
- `confidence`
- `max_severity`
- `evidence_refs`
- `human_consensus_summary`
- `adjudication_summary`
- `cost`
- `latency`
- `retry_recommendation`
- `release_gate_effect`
- `created_at`

## AgentFeedbackSignal

Machine-readable feedback sent to agents, CI, release gates, issue trackers, and dashboards.

**Fields**

- `feedback_id`
- `job_id`
- `final_verdict`
- `failed_criteria`
- `severity`
- `defect_category`
- `evidence_pointers`
- `human_annotations`
- `machine_check_failures`
- `retry_allowed`
- `retry_reason`
- `repair_hint`
- `budget_state`
- `policy_constraints`

## VerdictLedgerEvent

Immutable audit event.

**Fields**

- `event_id`
- `job_id`
- `event_type`
- `actor_type`: system, agent, reviewer, adjudicator, provider
- `occurred_at`
- `payload_hash`
- `artifact_hashes`
- `policy_version`
- `cost_delta`
- `correlation_id`

**Validation Rules**

- Every state transition and externalization decision creates a ledger event.
- Ledger events are append-only.
