# Provider Integration Proof

## Latest validation (2026-06-09, main)

```bash
mise install
npm ci
npm run verify
npm run validate:provider
npm run validate:provider-e2e
# Bux only (linked AWS account):
npm run validate:mturk-phase6
```

## Outcome

- `npm run verify`: pass → allow (lint, build, 82 tests via broker gate)
- `npm run validate:provider`: config validation passes with mock provider env
- `npm run validate:provider-e2e`: simulated dispatch → callback → `auto_advanced: true` → `final_verdict: pass`

## Key evidence (in-repo)

- Pass provider callbacks auto-advance through consensus/adjudication (`ProviderWorkflowService`)
- Unclear callbacks do **not** auto-advance — manual consensus/adjudication still required
- Managed provider dispatch returns `dispatch_status: "dispatched"` in mock mode
- SQLite-backed provider mappings survive restart when `PROVIDER_SQLITE_PATH` is reused
- Privacy-blocked externalization rejects provider dispatch
- Degraded-provider fallback keeps the task queued

## Sandbox E2E (real MTurk)

Phase 1 pass receipt captured in mturk-staging worktree — see
`docs/ops/mturk-sandbox-e2e-proof.md` (synced from worktree proof).

| Field | Value |
|-------|-------|
| Job ID | `job_fa7b9778-cfe6-4e54-9374-d6d0140f67ee` |
| HIT ID | `3EGKVCRQFXT8E0OD232RVG7ISQDBY7` |
| Assignment ID | `39DD6S19JQC8DD8WYIB2ZFIKGVUEZ7` |
| Outcome | worker pass → bridge callback → verdict pass |

**Remaining:** ambiguous/fail sandbox case on Bux; `validate:mturk-phase6` AWS list step on Bux.

## Historical run (2026-05-31)

Feature worktree `003-provider-integration`: 38 test files, 51 tests at time of capture.
