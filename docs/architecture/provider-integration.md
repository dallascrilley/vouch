# Provider Integration Architecture

The provider integration path keeps the existing verification control plane
intact and adds a narrow managed-provider lane:

- `src/config/provider-config.ts` validates local provider enablement
- `src/adapters/providers/real-provider-adapter.ts` owns outbound dispatch
- `src/domain/human-review/provider-task-mapping-service.ts` persists provider
  task and receipt state
- `src/api/routes/provider-callback.ts` ingests one callback path and normalizes
  it into the existing provider-neutral human response model
- `src/domain/human-review/provider-operations-service.ts` tracks health and
  degraded fallback behavior

The callback path deliberately feeds the same `ResponseValidationService`,
`ConsensusService`, `AdjudicationService`, and feedback endpoints already used
by the rest of the runtime.

## Provider Bridge Contract

Provider bridges are intentionally outside broker core. The broker dispatches a
review task to a bridge over HTTP, and the bridge is responsible for provider
task creation, provider polling or webhook handling, and normalizing returned
provider answers into the broker callback payload.

Shared bridge behavior lives in `scripts/lib/provider-bridge.ts`:

- persisted task mapping state
- callback attempt counting
- broker callback delivery
- receipt dedupe via delivered response IDs
- dead-letter recording after bounded retries
- operator state summaries

Provider-specific bridge behavior remains isolated to adapter scripts such as
`scripts/mturk-bridge.ts`:

- provider task creation API
- provider answer parsing
- provider status/expiration refresh
- provider-specific approval or qualification controls

The broker core should not need provider-specific branching for MTurk versus a
similar provider. A new provider must normalize its response into the callback
schema and can reuse the common bridge delivery helper for the retry/dedupe
state machine.

`scripts/mock-provider-bridge.ts` is the runnable second-provider prototype. It
exposes the same bridge shape as MTurk for dispatch, state inspection, and
provider response delivery:

- `POST /dispatch` accepts the broker dispatch payload and returns a provider
  task ID.
- `POST /responses` simulates a provider-side worker response and delivers the
  normalized callback through `deliverProviderCallback`.
- `GET /state` exposes the common bridge summary.

This prototype is intentionally provider-agnostic: it does not know broker job,
privacy, verdict, or feedback internals. It proves that another provider can
plug into the same dispatch/callback contract without changing broker core
concepts. Broker dispatch worker construction is config-driven when
`PROVIDER_ENABLED=true`; it is not gated to MTurk or the staging
`real-provider` ID.

## HIT recovery assignment count

After an ambiguous `create-hit` (the HIT may already exist), the MTurk bridge
must keep polling for the original assignment count.
`recoveredHitMaxAssignments` reads `pricing.max_assignments` from a `v: 1`
task template. It does **not** use process-wide `MTURK_MAX_ASSIGNMENTS` (often
`1`) when the envelope is structured. A medium-risk 3-assignment HIT recovered
that way would stop after the first delivery and drop the remaining paid
reviews. Legacy free-text templates still use the bridge default.

Code: `scripts/lib/mturk-bridge.ts` (`recoveredHitMaxAssignments`).
Tests: `tests/unit/mturk-bridge.test.ts`.
