# Agent Review Contract

This contract defines how an autonomous agent commissions human review and consumes the result without operator interpretation.

## Commissioning Request

An agent commissions review through the existing control-plane endpoints:

1. `POST /verification-jobs`
2. `POST /verification-jobs/:jobId/artifacts`
3. `POST /verification-jobs/:jobId/privacy-classification`
4. `POST /verification-jobs/:jobId/human-review-tasks`

The commissioning request must include:

- Criteria: `acceptance_criteria[].criterion_id`, `human_visible_text`, `criticality`, and `evidence_requirements`.
- Evidence package: artifact manifest IDs and immutable artifact metadata from `/artifacts`.
- Risk/privacy class: `risk_tier`, privacy `data_class`, `redaction_status`, `externalization_decision`, and `allowed_reviewer_routes`.
- Budget/deadline: `budget_policy`, job `deadline_at`, and human-review task `deadline_at`.
- Reviewer pool/provider policy: human-review `reviewer_pool`, optional `provider_adapter`, `quality_policy`, and `task_template`.
- Agent correlation: `agent_run_id`, `idempotency_key`, and `source` fields.

`externalization_decision` is a client hint. The broker overwrites fail-closed
classifications and re-checks policy at dispatch. Jobs that request a
non-internal pool with `agent_run_id` also need the server-held go-live grant.
See [`privacy-gate.md`](privacy-gate.md).

Real-provider dispatch with `VOUCH_REAL_SPEND_CEILING_USD` set requires a `v: 1`
`task_template` pricing object and a task `idempotency_key`. See
[`docs/ops/spend-ceiling.md`](../ops/spend-ceiling.md). Replaying that key
with a different job, pool, package, template, quality policy, provider
adapter, or criterion set is rejected (403); a matching replay returns the
stored task. See
[`human-review-task-idempotency.md`](human-review-task-idempotency.md).

## Completion Response

The agent consumes `GET /verification-jobs/:jobId/feedback`.

The response is complete for autonomous decision-making when these fields are present:

- `agent_next_action`: one of `pass`, `fail`, `retry`, `recapture`, or `escalate`.
- `final_verdict`: provider-neutral final verdict used by release gates and ledgers.
- `failed_criteria`: exact criteria the agent must repair or re-evaluate.
- `retry_allowed`: whether the agent may automatically try again under policy.
- `retry_reason` and `repair_hint`: why the next action was chosen.
- `evidence_pointers`: evidence manifest or artifact refs that drove the decision.
- `provider_ids` and `provider_response_ids`: external-review receipts for traceability.
- `policy_constraints`: any privacy, budget, or adjudication constraints that limit autonomy.

## Agent Action Semantics

- `pass`: proceed or release.
- `fail`: stop; do not retry automatically.
- `retry`: rerun the verification or repair loop using the failed criteria and hints.
- `recapture`: collect better evidence before retrying.
- `escalate`: hand off to an operator or higher-trust review lane because the broker cannot authorize an autonomous retry.

## Phase 6 Proof

`tests/integration/mock-provider-bridge-e2e.test.ts` simulates the required loop:

1. An agent creates a job with criteria, evidence, privacy route, budget, deadline, provider policy, and `agent_run_id`.
2. Broker dispatches to the runnable `mock-second-provider` bridge.
3. The provider submits an ambiguous response through the bridge callback path.
4. Broker ingests the callback, auto-runs consensus/adjudication, emits verdict and feedback.
5. The feedback endpoint returns `agent_next_action: "retry"` with failed criteria, evidence pointers, provider receipts, retry permission, and repair hint.
