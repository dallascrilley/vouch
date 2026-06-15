# Launch Criteria — AI Human Review Broker

Consolidated P0/P1 launch contract for the SQLite-first local runtime.
Each criterion lists proof level, validation status, evidence, and verification command.

**Proof levels:** A = visual/manual capture, B = behavioral test/script, C = structural only.

**Status:** `validated` | `partial` | `missing` | `stale`

Last updated: 2026-06-14 (plan: `docs/plans/2026-06-14-feat-whats-next-finish-plan.md`)

## P0 — Launch blockers

| ID | Criterion | Proof | Status | Evidence / gate |
|----|-----------|-------|--------|-----------------|
| P0-1 | Agent commissions review via CLI and receives pass verdict + exit code 0 on simulated happy path | B | **validated** | `npm run validate:agent-loop` |
| P0-2 | Simulated provider dispatch → callback → auto-advance → pass feedback (in-process) | B | **validated** | `npm run validate:provider-e2e` |
| P0-3 | Real MTurk sandbox worker assignment ingested with broker response evidence | A/B | **validated** | `docs/ops/mturk-sandbox-e2e-proof.md`; optional `npm run validate:mturk-phase6` on Bux |
| P0-4 | Real paid MTurk production round-trip with bounded spend | A/B | **validated** | `docs/ops/mturk-production-paid-proof.md` |
| P0-5 | Ambiguous/unclear worker path does not auto-advance; adjudication yields retry | B | **partial** | Offline: `npm run validate:provider-proof-bundle -- mturk-sandbox-ambiguous-v1`; live Bux IDs **missing** — see `docs/ops/mturk-sandbox-ambiguous-proof.md` |
| P0-6 | Release gate dogfoods broker (`lint` + `build` + tests through verify lifecycle) | B | **validated** | `script/cibuild`; `npm run verify` with `BROKER_URL` when remote |
| P0-7 | MTurk bridge operational contract: backoff, dead-letter visibility, delivery-complete short circuit | B/C | **validated** | `docs/ops/bridge-health-contract.md`, `docs/ops/mturk-bridge-restart-proof.md`; unit tests |
| P0-8 | Docker cold-start smoke: health + simulated review verdict | B | **partial** | `script/validate-docker-smoke` (local; not in CI) |

## P1 — Post-launch / deferred

| ID | Criterion | Status | Notes |
|----|-----------|--------|-------|
| P1-1 | MCP primitive broker tools for agents | **validated** | `npm run mcp:broker`; epic td-95dc1a |
| P1-2 | Stuck-state API on poll timeout | **validated** | `GET /verification-jobs/:jobId/stuck-state`; tests in `tests/integration/stuck-state.test.ts` |
| P1-3 | PostgreSQL / pg-boss production runtime | **deferred** | GitHub issue #1 RFC; SQLite-first is current launch scope |
| P1-4 | Second provider bridge prototype | **deferred** | goalplan Phase 5 |
| P1-5 | Pairwise tie-break for split worker signals | **deferred** | `docs/ideation/2026-06-09-surprise-me-ideation.md` #2 |

## Runnable verification matrix

```bash
npm run validate:agent-loop          # P0-1 full CLI + worker
npm run validate:provider-e2e        # P0-2 in-process sim E2E
npm run validate:provider-proof-bundle -- mturk-sandbox-ambiguous-v1  # P0-5 offline
npm test                             # full suite (171+ tests)
script/cibuild                       # CI release gate
script/validate-docker-smoke         # P0-8 container smoke (requires Docker)
```

## Source documents

- Phased acceptance: `docs/planning/goalplan.md`
- Agent integration: `docs/architecture/agent-loop-integration.md`
- Provider ops: `docs/ops/provider-e2e-playbook.md`, `docs/ops/bux-mturk-runbook.md`
