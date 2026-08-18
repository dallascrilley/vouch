# Privacy Gate Threat Model

## Primary Risks

- Raw screenshots, DOM snapshots, or logs leaking to public reviewers
- Misrouting sensitive evidence to the public crowd
- Budget exhaustion causing silent behavior changes
- Human-review disagreement masking severe issues
- Provider outages causing stale or partial review states
- A client asserting `externalization_decision: allowed` for evidence the
  server must not ship
- A client replaying an `idempotency_key` with a different `reviewer_pool`
  than the stored task, so the gate would allow a pool the dispatch will not
  use

## Current Controls

- Externalization policy blocks regulated or failed-redaction evidence
- Server overwrites client `externalization_decision` when redaction is
  `failed` or `insufficient_confidence`
- Dispatch re-evaluates policy for the **stored** task `reviewerPool`
  (`assertProviderDispatchAllowed` in `human-review.ts`, `evidence.ts`, and
  `provider-callback.ts`). The pool asserted on the current request body is
  not enough on its own: `createOrGet` returns an existing task by
  `idempotency_key`, and before #38 it did not require that pool to match
- Agent external review requires the server-held go-live grant
  (`LOCAL_PROVIDER_MODE=disabled` with `PROVIDER_ENABLED=true` for live
  providers). See [`docs/architecture/privacy-gate.md`](../architecture/privacy-gate.md)
- Public crowd routing is limited to safe public evidence
- Billing routes require internal review
- `blocked_fail_closed` emits a terminal verdict and `retry_allowed: false`
- Ledger records privacy decisions, state transitions, and budget-blocked events
- `VOUCH_REAL_SPEND_CEILING_USD` reserves real-dispatch cost idempotently;
  overage fails closed and does not fall back to simulated review
  ([`docs/ops/spend-ceiling.md`](../ops/spend-ceiling.md))
- Job, privacy, provider-mapping, and spend state persist in SQLite, not
  process memory
- Managed brokers authenticate `/health` with an HMAC `health_proof` keyed by
  `RUNTIME_OPERATOR_TOKEN`
- Consensus requires at least one recorded human response
- Adjudication remains a separate path for disputed or severe cases

## Residual Gaps

- Real redaction transforms are still represented by policy state, not artifact
  mutation
- No cumulative spend cap unless `VOUCH_REAL_SPEND_CEILING_USD` is set
- Metrics stay in-process (`InMemoryMetricsRecorder`); alerting and dashboards
  are not wired to a runtime backend
- Provider config in the composition root is still an in-memory map; task
  mappings persist only when `PROVIDER_SQLITE_PATH` is set (default on
  non-test runs)
- `createOrGet` now rejects a replay that changes a task-identifying field
  (#38), so the stored-pool gate and the replay check are independent
  defences. `deadline_at` and visual evidence are still not compared, by
  design
- The gate runs after `createOrGet` commits. A blocked first attempt still
  leaves a queued task; operators should not assume 403 means no row
