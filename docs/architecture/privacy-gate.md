# Privacy Gate

The privacy gate decides whether evidence may leave the broker. Client-supplied
`externalization_decision` is not authoritative. The server rewrites fail-closed
classifications, then re-evaluates policy at dispatch for the stored task
`reviewerPool`.

## Intent

- Keep raw screenshots, DOM, and logs off the public crowd unless policy allows.
- Fail closed on secret, regulated, or unsuccessful redaction.
- Make agent externalization a server-held go-live grant, not a field the agent
  can assert.

## Classification flow

1. Attach an artifact manifest (`POST /verification-jobs/:jobId/artifacts`).
   Classification without a persisted manifest, or with a mismatched
   `artifact_manifest_id`, is rejected.
2. `POST /verification-jobs/:jobId/privacy-classification` calls
   `PrivacyGate.record`.
3. `enforceServerSideDecision` may overwrite `data_class` and
   `externalization_decision`.
4. A `blocked_fail_closed` decision emits a terminal `fail_closed` verdict and
   feedback with `retry_allowed: false`.
5. Later dispatch calls `assertProviderDispatchAllowed`, which **recomputes**
   `evaluateExternalizationPolicy` for the reviewer pool on the **stored
   task**. A stored client decision is not enough, and neither is the pool
   asserted on the current request body.

## Dispatch pool

`assertProviderDispatchAllowed(jobId, providerRoute)` evaluates policy for
`providerRoute`. Every real-provider dispatch must pass the pool that
`providerDispatchWorker.dispatch` will actually send:

| Call site                     | File                                  | Pool passed to the gate   |
| ----------------------------- | ------------------------------------- | ------------------------- |
| `POST .../human-review-tasks` | `src/api/routes/human-review.ts`      | `reviewTask.reviewerPool` |
| Self-verification escalation  | `src/api/routes/evidence.ts`          | `task.reviewerPool`       |
| Pairwise follow-up            | `src/api/routes/provider-callback.ts` | `task.reviewerPool`       |

Do not substitute `request.body.reviewer_pool`. `HumanReviewTaskService.createOrGet`
resolves `idempotency_key` to an existing row, and until #38 it did so without
requiring the requested pool to match — so a replay could assert `internal`
while the stored task was still `managed`. On a first create the two values are
always the same; the divergence was only ever on the replay path.

#38 now rejects a replay whose `reviewer_pool` (or other task-identifying
field) differs from the stored task, so the two defences are independent: even
if the replay check were removed, gating the stored pool still blocks the
bypass. Keep both.

`createOrGet` runs **before** the gate. A 403 still leaves a queued task.
Replaying the same key with a pool the billing rule would permit must still
403 when the stored pool is `managed`. Regression:
`tests/integration/security-regression.test.ts` ("blocks a replayed
idempotency key that asserts a different pool than the stored task").

## Policy (`evaluateExternalizationPolicy`)

| Condition                                                        | Result                    |
| ---------------------------------------------------------------- | ------------------------- |
| `redaction_status` is `failed` or `insufficient_confidence`      | `blocked_fail_closed`     |
| `data_class` is `regulated_or_secret` and pool is not `internal` | `blocked_fail_closed`     |
| `data_class` is `sensitive_internal` and pool is `public_crowd`  | `managed_only` (blocked)  |
| route starts with `/billing` and pool is not `internal`          | `internal_only` (blocked) |
| otherwise                                                        | `allowed`                 |

Failed redaction is forced fail-closed even when the client sends
`externalization_decision: allowed`.

## Agent externalization grant

`PrivacyGate` takes `agentExternalizationEnabled`:

```text
localProviderMode === "disabled"  OR  PROVIDER_ENABLED !== "true"
```

- Demo / simulated path (`PROVIDER_ENABLED` not `true`): grant is on, but
  reviews stay simulated and do not cross a live crowd boundary.
- Real provider with default `LOCAL_PROVIDER_MODE=simulated`: grant is **off**.
  Jobs with `agent_run_id` that request a non-internal pool fail closed
  (`agent externalization requires the server-held go-live grant`).
- Pi go-live writes `LOCAL_PROVIDER_MODE=disabled` and `PROVIDER_ENABLED=true`,
  which turns the grant on.

Jobs whose `source.repository` is `pi-extension` and that request external
review without `agent_run_id` also fail closed.

## Health proof

Managed supervisors (Pi broker, MTurk bridge) probe `GET /health` with
`x-health-challenge`. The body is:

```json
{
  "broker_version": "vouch-broker-v1",
  "health_proof": "<base64url HMAC>",
  "local_provider_mode": "simulated",
  "status": "ok"
}
```

`health_proof` is HMAC-SHA256 of `health:v1:<challenge>` keyed by
`RUNTIME_OPERATOR_TOKEN` (`src/domain/privacy/health-proof.ts`). The challenge
path does not return `database_path`. The full health document still requires
`x-operator-token` when that token is configured.

## Pitfalls

- Honest `--data-class` on the CLI still matters, but the gate will block
  restricted classes even if the client asks for `allowed`.
- `allowed_reviewer_routes` must include the **stored** dispatch pool **and**
  the recomputed policy must allow that pool. A replay body that names a
  permitted pool does not rewrite the task.
- Do not treat a 403 from `POST .../human-review-tasks` as "no task exists".
  The row is committed first; a later replay with the same
  `idempotency_key` retries dispatch of that stored task.
- `createOrGet` rejects a replay that changes `reviewer_pool`,
  `criterion_ids`, `sanitized_package_id`, `task_template`, `quality_policy`,
  or `provider_adapter` (#38). `deadline_at` and visual evidence are
  deliberately not compared: a legitimate dispatch retry may carry a refreshed
  deadline, and evidence is addressed by the sanitized package id. This puts
  review tasks in line with the spend ledger, which already rejected a reused
  key with a different job or amount
  ([`docs/ops/spend-ceiling.md`](../ops/spend-ceiling.md)).
- Enabling `PROVIDER_ENABLED=true` without `LOCAL_PROVIDER_MODE=disabled`
  blocks agent external review. Use `/vouch-go-live` rather than toggling one
  variable.
- Redaction is still a policy flag, not an artifact transform. Do not claim
  pixels were stripped unless a sanitizer actually ran.

Code: `src/domain/privacy/privacy-gate.ts`,
`src/domain/privacy/externalization-policy.ts`,
`src/domain/privacy/health-proof.ts`,
`src/domain/human-review/human-review-task-service.ts`,
`src/api/routes/human-review.ts`.
