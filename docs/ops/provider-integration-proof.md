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

**Bux verified (2026-06-10):** `npm run validate:mturk-phase6` exit 0 — AWS sandbox assignment + broker `agent_next_action: pass`.

**Offline ambiguous path (2026-06-14):** `docs/ops/mturk-sandbox-ambiguous-proof.md` +
`npm run validate:provider-proof-bundle -- mturk-sandbox-ambiguous-v1` — callback
`auto_advanced: false`, consensus/adjudication → retry.

**Optional Bux live regression:** replace simulated IDs in the ambiguous proof bundle
after a real sandbox unclear/fail HIT (see `docs/ops/bux-mturk-runbook.md`).

## Historical run (2026-05-31)

Feature worktree `003-provider-integration`: 38 test files, 51 tests at time of capture.
