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
