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
