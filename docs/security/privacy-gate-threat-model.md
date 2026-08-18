# Privacy Gate Threat Model

## Primary Risks

- Raw screenshots, DOM snapshots, or logs leaking to public reviewers
- Misrouting sensitive evidence to the public crowd
- Budget exhaustion causing silent behavior changes
- Human-review disagreement masking severe issues
- Provider outages causing stale or partial review states
- A client asserting `externalization_decision: allowed` for evidence the
  server must not ship

## Current Controls

- Externalization policy blocks regulated or failed-redaction evidence
- Server overwrites client `externalization_decision` when redaction is
  `failed` or `insufficient_confidence`
- Dispatch re-evaluates policy for the concrete reviewer pool
  (`assertProviderDispatchAllowed`); the stored client decision is not enough
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
