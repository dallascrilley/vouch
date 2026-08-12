# Event Contracts: Verification Control Plane

All events are append-only ledger entries with `event_id`, `job_id`, `event_type`, `occurred_at`, `correlation_id`, `policy_version`, and `payload_hash`. Events may include artifact hashes, cost deltas, provider references, and actor metadata, but must never include raw secrets, raw logs, hidden agent reasoning, or unredacted customer data.

## `verification.job.created`

Emitted when job intake accepts a new verification request.

**Payload**

- `job_id`
- `idempotency_key`
- `agent_run_id`
- `source`
- `risk_tier`
- `acceptance_criterion_ids`
- `deadline_at`
- `budget_policy_id`

## `verification.artifacts.attached`

Emitted when a job receives an artifact manifest.

**Payload**

- `job_id`
- `manifest_id`
- `artifact_refs`
- `artifact_hashes`
- `environment`
- `artifact_quality`

## `verification.privacy.classified`

Emitted after privacy gate classification.

**Payload**

- `job_id`
- `classification_id`
- `data_class`
- `redaction_status`
- `externalization_decision`
- `allowed_reviewer_routes`
- `blocked_reasons`
- `policy_version`

## `verification.self.completed`

Emitted after automated verification.

**Payload**

- `job_id`
- `result_id`
- `criterion_results`
- `confidence`
- `recommended_action`
- `failure_categories`
- `artifact_sufficiency`

## `verification.review.queued`

Emitted when a sanitized human review task is queued.

**Payload**

- `job_id`
- `review_task_id`
- `reviewer_pool`
- `provider_adapter`
- `sanitized_package_id`
- `criterion_ids`
- `deadline_at`
- `max_assignments`

## `verification.review.response_received`

Emitted after a provider or internal reviewer response is normalized.

**Payload**

- `job_id`
- `review_task_id`
- `response_id`
- `provider_assignment_ref`
- `overall_verdict`
- `criterion_result_summary`
- `severity`
- `defect_category`
- `confidence`
- `quality_flags`

## `verification.consensus.completed`

Emitted when consensus produces an outcome or escalation recommendation.

**Payload**

- `job_id`
- `consensus_id`
- `valid_response_count`
- `quorum_state`
- `disagreement_level`
- `recommended_outcome`
- `adjudication_trigger`
- `severity_summary`

## `verification.adjudication.decided`

Emitted when adjudication records a decision.

**Payload**

- `job_id`
- `adjudication_id`
- `trigger_reason`
- `assigned_pool`
- `decision`
- `decision_summary`

## `verification.verdict.finalized`

Emitted when the authoritative final verdict is recorded.

**Payload**

- `job_id`
- `verdict_id`
- `final_verdict`
- `criterion_outcomes`
- `confidence`
- `max_severity`
- `evidence_refs`
- `cost`
- `latency_seconds`
- `release_gate_effect`

## `verification.feedback.emitted`

Emitted after machine-readable feedback is available to agents, CI, release gates, issue trackers, or dashboards.

**Payload**

- `job_id`
- `feedback_id`
- `final_verdict`
- `failed_criteria`
- `severity`
- `defect_category`
- `retry_allowed`
- `retry_reason`
- `repair_hint`
- `budget_state`
- `policy_constraints`

## `verification.budget.blocked`

Emitted when a job cannot continue paid review because a budget cap is reached.

**Payload**

- `job_id`
- `budget_policy_id`
- `cap_type`
- `attempted_cost`
- `current_spend`
- `configured_cap`
- `resulting_action`

## `verification.fail_closed`

Emitted when the system blocks progress due to privacy, missing evidence, budget, deadline, provider integrity, or unavailable approved reviewer route.

**Payload**

- `job_id`
- `reason`
- `policy_version`
- `blocked_routes`
- `required_next_action`

## `verification.provider.auto_resolved`

Emitted when a unanimous provider callback auto-advances a job to its final verdict without manual consensus or adjudication rows.

**Payload**

- `job_id`
- `review_task_id`
- `provider_id`
- `provider_response_id`
- `overall_verdict`
- `valid_response_count`

## `verification.provider.pairwise_queued`

Emitted when disagreeing provider responses trigger a pairwise tie-break micro-task instead of a terminal verdict.

**Payload**

- `job_id`
- `source_review_task_id`
- `pairwise_review_task_id`
- `disagreement_verdicts`
