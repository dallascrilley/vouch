---
date: 2026-06-14
origin: docs/whats-next/2026-06-14.md
td_run_label: whats-next-2026-06-14
---

# Finish launch-critical path (whats-next 2026-06-14)

**Summary:** Execute the five whats-next roadmap items (R1–R5): consolidate launch
criteria, prove the agent CLI loop, capture bridge restart recovery, run live Bux
ambiguous sandbox proof, and add a Docker deployment smoke path. Each unit closes
its mapped `td-*` issue when verification passes.

## Requirements

- R1. **Launch contract** — `LAUNCH_CRITERIA.md` with ≥5 P0 criteria, proof level
  (A/B/C), validation status, and links to runnable gates or proof docs (`td-2cb569`).
- R2. **Live ambiguous sandbox proof** — real Bux worker unclear verdict →
  `auto_advanced: false` → adjudication → `retry` feedback; proof doc + optional
  fixture ID refresh (`td-bfabca`).
- R3. **MTurk bridge Phase 4 closure** — restart/recovery proof captured; bridge
  operational contract fully tested/documented (poll backoff, dedupe, dead-letter
  visibility already in code) (`td-4b0363`).
- R4. **Agent-autonomous loop** — scripted Level B proof: `npm run review --wait`
  → exit code + `agent_next_action` without manual consensus POSTs on happy path
  (`td-e07629`).
- R5. **Docker smoke** — `docker build` → `/health` → simulated review verdict
  without host Node toolchain (`td-9083c8`).

## Key technical decisions

- **Launch contract is the spine.** Other units update `LAUNCH_CRITERIA.md` when
  they add proof — avoids doc drift called out in whats-next R1.
- **Agent loop proof uses real worker process, not inject-only.** Prior failure:
  queue worker did not auto-advance and could exit early
  (`docs/solutions/runtime/sim-worker-never-finalizes-verdict.md`). Validation
  must spawn API + `dev:worker` (or compiled worker), kill stale workers first,
  and assert CLI exit 0 within ~30s.
- **Bridge Phase 4 is mostly shipped; unit closes the proof gap.** Poll backoff,
  `throttleEvents`, dead-letter aggregation, and correlation logging already live
  in `scripts/mturk-bridge.ts` and `docs/ops/bridge-health-contract.md`. U3
  focuses on restart/recovery evidence and test coverage, not re-implementing
  backoff.
- **Live Bux work is human-gated like paid MTurk proof.** Follow
  `docs/ops/bux-mturk-runbook.md` and `docs/plans/2026-06-11-feat-mturk-paid-production-proof-plan.md`
  pattern: agent stops at creds/MFA; Dallas runs worker submit on Bux.
- **Docker smoke uses HTTP API sequence, not `npm run review`.** Runtime image
  ships `dist/` only (`Dockerfile`); no `tsx`/scripts in container. Smoke script
  drives `/health` + minimal verification-job API with simulated provider env.

## td workflow (every unit)

Before starting a unit:

```bash
td update <td-id> --status in_progress
```

After verification passes:

```bash
td close <td-id> --reason "Verified: <command or proof path>"
```

Preserve label `whats-next-2026-06-14`. Log blockers with `td log <td-id> --type blocker`.

## Implementation units

### U1. Launch contract (`LAUNCH_CRITERIA.md`)

- **Goal:** Single launch contract file maps P0/P1 criteria to proof status and gates.
- **Requirements:** R1
- **td:** `td-2cb569`
- **Files:**
  - `LAUNCH_CRITERIA.md` (new)
  - `README.md` (link under Validation)
  - `docs/planning/goalplan.md` (cross-link only if needed)
- **Approach:**
  - Derive P0 from goalplan Phases 1–3 acceptance (mark **validated** where proof
    exists: `docs/ops/mturk-sandbox-e2e-proof.md`, `docs/ops/mturk-production-paid-proof.md`,
    `npm run validate:provider-e2e`, proof bundles).
  - Derive open P0 from Phases 4–6 + whats-next gaps (ambiguous live proof,
    agent CLI loop, Docker smoke, bridge restart proof) as **partial** or **missing**.
  - Each row: criterion, proof level, status, evidence path, verification command.
  - P1: MCP surface, stuck-state API, production PostgreSQL RFC — explicitly deferred.
- **Tests:** None (doc-only unit).
- **Verification:** File exists with ≥5 P0 rows; `grep -c validated LAUNCH_CRITERIA.md` ≥ 3.
- **td close when:** `LAUNCH_CRITERIA.md` merged and linked from README.

### U2. Agent-autonomous review loop validation

- **Goal:** Runnable gate proves full CLI commissioning path without operator POSTs.
- **Requirements:** R4
- **td:** `td-e07629`
- **Depends on:** U1 (reference gate in launch contract)
- **Files:**
  - `scripts/validate-agent-loop.ts` (new)
  - `package.json` (`validate:agent-loop` script)
  - `LAUNCH_CRITERIA.md` (add Level B row)
  - Optional: `tests/integration/agent-loop-cli.test.ts` if script delegates to shared helper
- **Approach:**
  - Mirror `scripts/validate-provider-e2e-simulated.ts` env (`PROVIDER_DISPATCH_MODE=mock`,
    in-memory or temp sqlite) but drive **`scripts/request-review.ts`** via
    `child_process` with `--template binary_screenshot_check`, temp screenshot,
    `--wait`, `--broker-url`.
  - Start compiled or tsx worker in background; register cleanup; `pgrep` guard per
    sim-worker learning.
  - Parse stdout JSON; assert `agent_next_action === "pass"` and process exit 0.
  - Timeout ≤ 60s with actionable error if worker missing.
- **Tests:**
  - Happy path: review --wait returns pass within timeout.
  - Error path: worker not running → non-zero exit with message mentioning `dev:worker`.
- **Verification:** `npm run validate:agent-loop` exits 0.
- **td close when:** script passes locally and LAUNCH_CRITERIA row points to it.

### U3. MTurk bridge restart recovery + Phase 4 proof closure

- **Goal:** Documented restart/recovery proof; bridge health contract backed by tests.
- **Requirements:** R3
- **td:** `td-4b0363`
- **Files:**
  - `docs/ops/mturk-bridge-restart-proof.md` (new)
  - `tests/unit/mturk-bridge.test.ts` (extend if gaps)
  - `tests/unit/provider-bridge.test.ts`
  - `docs/ops/bridge-health-contract.md` (link restart proof)
  - `LAUNCH_CRITERIA.md` (update bridge ops row)
- **Approach:**
  - Audit `scripts/mturk-bridge.ts` + `scripts/lib/provider-bridge.ts` against
    goalplan Phase 4 checklist; record **already done** vs **this unit** in proof doc.
  - Capture restart proof: bridge state file + broker sqlite with in-flight HIT →
    stop bridge → restart → confirm `deliveredAssignmentIds` / no duplicate callback
    (use sandbox sim or recorded state from `.runtime/` — no secrets in doc).
  - Add unit test for throttle backoff progression if not already covered (double
    interval capped at `MTURK_MAX_POLL_BACKOFF_MS`, `throttleEvents` append).
  - Confirm `summarizeBridgeState` exposes `deadLetters` for operator visibility.
- **Tests:**
  - Backoff doubles on throttling error message; clears after successful poll.
  - `deliveryComplete` stops poll requirement (existing provider-bridge tests).
  - Restart: persisted state reload preserves `deliveredAssignmentIds` (existing
    mturk-bridge.test.ts "restart recovery" case — extend if thin).
- **Verification:** `npm test -- tests/unit/mturk-bridge.test.ts tests/unit/provider-bridge.test.ts`; proof doc committed.
- **td close when:** proof doc + tests green; LAUNCH_CRITERIA bridge row **validated** or **partial** with honest status.

### U4. Live Bux sandbox ambiguous worker proof

- **Goal:** Real sandbox unclear assignment proven end-to-end on Bux (not offline sim IDs).
- **Requirements:** R2
- **td:** `td-bfabca`
- **Depends on:** U1 (criterion row), U3 (bridge stable — recommended)
- **Files:**
  - `docs/ops/mturk-sandbox-ambiguous-proof.md`
  - `docs/ops/bux-mturk-runbook.md` (add live ambiguous section with env vars)
  - `tests/fixtures/provider-return-path/mturk-sandbox-ambiguous-v1/manifest.json` (optional ID refresh)
  - `LAUNCH_CRITERIA.md`
- **Approach:**
  - On Bux: dispatch HIT with criterion tuned for unclear worker response (or use
    runbook ambiguous steps).
  - Worker submits `overall_verdict: unclear`; capture callback response
    `{ "auto_advanced": false }`.
  - POST consensus + adjudication per proof doc; confirm feedback `final_verdict: retry`.
  - Update proof doc correlation table with live HIT/assignment/job IDs.
  - Optionally extend `scripts/verify-mturk-phase6-run.ts` usage with
    `EXPECTED_AGENT_NEXT_ACTION=retry` or document manual verification commands.
  - **Human gate:** Dallas submits worker assignment; agent prepares dispatch +
    captures inspection JSON.
- **Tests:** Offline bundle remains default CI gate (`validate:provider-proof-bundle`).
  Live proof is Level A/B manual evidence in doc.
- **Verification:** Proof doc contains non-`SIM-*` assignment ID; bridge `/state` +
  broker inspection snapshots referenced (paths only, no secrets).
- **td close when:** live IDs in proof doc and runbook updated.

### U5. Docker deployment smoke

- **Goal:** Cold-start operator can verify container stack with one script.
- **Requirements:** R5
- **td:** `td-9083c8`
- **Files:**
  - `script/validate-docker-smoke` (new, bash)
  - `docs/ops/deployment.md`
  - `LAUNCH_CRITERIA.md`
  - Optional: `just validate-docker-smoke` in `justfile`
- **Approach:**
  - Build image; run API container + worker container sharing named volume.
  - `curl` or `node -e fetch` `GET /health` until 200.
  - POST minimal verification-job sequence via HTTP (same payloads as
    `validate-provider-e2e-simulated.ts`) with `LOCAL_PROVIDER_MODE=simulated`.
  - Assert final `GET …/feedback` returns `agent_next_action: pass`.
  - Tear down containers/volume in trap handler.
  - Document expected output in `deployment.md`; keep **out of CI** initially
    (whats-next tradeoff: minutes + Docker daemon).
- **Tests:** Script is the test; optional dry-run `--help` documents env vars.
- **Verification:** `script/validate-docker-smoke` exits 0 on machine with Docker.
- **td close when:** script + deployment doc section merged.

## Execution order

```text
U1 → U2 ─┐
U1 → U3 ─┼→ U4 (Bux, human-gated)
U5 (parallel after U1)
```

Recommended `ce-work` sequence: **U1 → U2 → U3 → U5 → U4**. U4 last because it
needs Bux access and benefits from U3 restart proof.

## Prior learnings applied

- `docs/solutions/runtime/sim-worker-never-finalizes-verdict.md` — U2 must run
  worker process and guard stale workers; inject-only API tests insufficient for
  agent loop proof.
- `docs/plans/2026-06-11-feat-mturk-paid-production-proof-plan.md` — U4 human
  funding/creds gates; proof captured in `docs/ops/` without secrets.

## Deferred / out of scope

- PostgreSQL/pg-boss production adapters (GitHub issue #1).
- Pairwise tie-break micro-task (ideation #2).
- Second provider bridge prototype (goalplan Phase 5).
- Docker smoke in GitHub Actions CI (add only if requested after local script stable).
- Generic doc polish unrelated to launch criteria rows.

## Open questions

- **U4 worker instruction:** Which template/question reliably elicits `unclear` from
  sandbox workers vs pass/fail? Resolve during Bux dispatch (implementation-time).
- **U5 simulated provider in Docker:** Confirm `LOCAL_PROVIDER_MODE=simulated` +
  worker entrypoint sufficient without `PROVIDER_ENABLED` real-provider env — verify
  during U5 first run.
