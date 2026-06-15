# MTurk Bridge Restart / Recovery Proof

Documents Phase 4 operational controls and restart behavior for the MTurk bridge.
Poll backoff, dead-letter visibility, and delivery-complete short circuit are
implemented in `scripts/mturk-bridge.ts` + `scripts/lib/provider-bridge.ts`; schema
in `docs/ops/bridge-health-contract.md`.

## Phase 4 checklist (goalplan)

| Control | Status | Evidence |
|---------|--------|----------|
| Poll interval / throttle backoff | **Shipped** | `nextPollBackoffMs()` in `scripts/lib/provider-bridge.ts`; `throttleEvents` on task |
| Duplicate assignment skip | **Shipped** | `deliveredAssignmentIds` check before callback in `scripts/mturk-bridge.ts` |
| Dead-letter visibility | **Shipped** | `deadLetterAssignments` per task; aggregated in `summarizeBridgeState().deadLetters` |
| HIT → assignment → job correlation logs | **Shipped** | Fastify logs include `hitId`, `reviewTaskId`, `assignmentId`, `workerId` |
| Restart without receipt loss | **Validated (offline)** | See below |

## Restart recovery (offline validation)

**Method:** Unit test persists bridge state to disk, reloads, and asserts delivery
metadata survives — `tests/unit/mturk-bridge.test.ts` ("persists operational delivery
metadata for restart recovery").

**Recorded sandbox receipt** (2026-06-08, `docs/ops/mturk-sandbox-e2e-proof.md`):

| Field | Value |
|-------|-------|
| HIT ID | `3EGKVCRQFXT8E0OD232RVG7ISQDBY7` |
| Assignment ID | `39DD6S19JQC8DD8WYIB2ZFIKGVUEZ7` |
| Job ID | `job_fa7b9778-cfe6-4e54-9374-d6d0140f67ee` |

After bridge delivery succeeded (`lastDeliveryAt` set), a subsequent AWS
`ThrottlingException` on poll did **not** roll back `deliveredAssignmentIds`.
Bridge state file: `.runtime/mturk-bridge-state.json` (local worktree, not committed).

**Expected operator behavior on restart:**

1. Bridge reloads `MTURK_BRIDGE_STATE_PATH` via `loadBridgeState`.
2. Assignments in `deliveredAssignmentIds` are skipped (no duplicate callback).
3. Tasks with `deliveryComplete: true` stop polling unless `MTURK_REPOLL_COMPLETED=true`.

## Verification commands

```bash
npm test -- tests/unit/mturk-bridge.test.ts tests/unit/provider-bridge.test.ts
npm run validate:mturk-phase6   # live stack on Bux when env IDs set
```

## Gaps / follow-up

- Live restart drill on Bux with in-flight HIT (stop bridge mid-poll, restart) — optional regression, not CI-gated.
- Ambiguous live sandbox proof tracked separately: `docs/ops/mturk-sandbox-ambiguous-proof.md`.
