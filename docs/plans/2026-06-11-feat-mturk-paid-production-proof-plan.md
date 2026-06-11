---
date: 2026-06-11
origin: (direct brief — no brainstorm doc; scope set in session 2026-06-10/11)
---

# Paid MTurk production proof

**Summary:** Prove the full broker loop with a real paid HIT on production MTurk
(anonymous crowd worker, real money), while keeping simulated and sandbox modes
fully supported as first-class, default-safe paths.

## Requirements

- R1. One complete paid round-trip: CLI commission → production HIT → anonymous
  worker submits → bridge delivers → broker verdict → CLI exit code, with a
  durable proof doc in `docs/ops/`.
- R2. Simulated mode (local, no infra) and sandbox mode remain supported and
  remain the defaults; production is opt-in only and cannot be reached by
  accident.
- R3. Real money is bounded: hard spend caps enforced in code, low-risk tier
  (1 assignment), total proof budget ≤ ~$1.
- R4. Worker quality controls on the paid HIT (qualification requirements), since
  the crowd is no longer ourselves.
- R5. Payment is verified, not assumed: assignment approval and account balance
  decrement are captured as evidence.

## Key technical decisions

- **No new mode flag in the broker.** Mode already lives entirely in bridge env
  (`scripts/mturk-bridge.ts:28-78`): sandbox endpoint is the default, production
  is `MTURK_AWS_ENDPOINT_URL=https://mturk-requester.us-east-1.amazonaws.com`.
  Sim/sandbox support (R2) is preserved by construction; we add a guard, not a
  rework.
- **Explicit production opt-in guard** — `MTURK_ALLOW_PRODUCTION=true` required
  when the endpoint is not the sandbox; otherwise the bridge refuses to start.
  Defense against a copy-pasted prod endpoint in a stale `.env`.
- **Reuse the existing spend rails** (`MTURK_MAX_REWARD_USD`,
  `MTURK_MAX_SPEND_PER_HIT_USD`, `MTURK_MAX_ASSIGNMENTS_PER_HIT`) with tight
  values for the proof; no new budget code.
- **Qualifications via existing `MTURK_QUALIFICATION_REQUIREMENTS_JSON`**
  (config, no code): ≥95% HIT approval rate and ≥100 approved HITs.
- **Run on Bux** (`bux-cmd`, stack from `docs/ops/mturk-access.md`): Mac hosts
  get `AWS.AccountNotLinked`. Same worktree/stack as the sandbox proof
  (broker :3200 / bridge :3300).
- **Funding is a human step.** Prepaid HIT balance on AWS account 181596276354
  via requester.mturk.com is owned by Dallas (root account, payment method);
  agents stop and hand off at that gate.

## Implementation units

### U1. Production opt-in guard in the bridge
- **Goal:** Bridge exits with a clear error at startup if
  `MTURK_AWS_ENDPOINT_URL` is non-sandbox and `MTURK_ALLOW_PRODUCTION` is not
  `"true"`; sandbox/sim behavior unchanged.
- **Requirements:** R2, R3
- **Files:** `scripts/mturk-bridge.ts`, `scripts/lib/mturk-bridge.ts` (wherever
  config validation lives), `tests/` (new unit test file mirroring existing
  bridge config tests)
- **Approach:** Extend the existing config-validation block (pattern at
  `scripts/lib/mturk-bridge.ts:236-332`) with the endpoint/flag check; surface
  `sandbox: boolean` it already computes (`scripts/mturk-bridge.ts:145`).
- **Tests:** prod endpoint + flag absent → startup error naming the flag; prod
  endpoint + flag true → passes validation; sandbox endpoint + flag absent →
  passes (default path untouched).
- **Verification:** `npm test` (new tests green) + `npm run verify`.

### U2. Production env profile + runbook section
- **Goal:** A reviewed, copy-pasteable production env block and a "Paid
  production run" section in the runbook, so the proof run is config, not
  improvisation.
- **Requirements:** R2, R3, R4
- **Files:** `docs/ops/bux-mturk-runbook.md`, `docs/ops/mturk-access.md`
- **Approach:** Document the production endpoint, `MTURK_ALLOW_PRODUCTION=true`,
  caps for the proof (`MTURK_REWARD=0.15`, `MTURK_MAX_REWARD_USD=0.25`,
  `MTURK_MAX_ASSIGNMENTS=1`, `MTURK_MAX_SPEND_PER_HIT_USD=0.50`),
  qualification JSON (approval rate ≥95%, approved HITs ≥100), approval policy
  and auto-approval delay, and the separate
  `MTURK_BRIDGE_STATE_PATH` for prod state so sandbox state is never mixed.
- **Tests:** n/a (docs); reviewed against U1's actual flag names.
- **Verification:** Env block lints against `scripts/mturk-bridge.ts` names
  (grep each var exists).

### U3. Fund the requester account — **user gate**
- **Goal:** Prepaid HIT balance ≥ $5 on AWS account 181596276354.
- **Requirements:** R1, R3
- **Files:** none (external)
- **Approach:** Dallas signs into requester.mturk.com (root email
  `dallas@dallascrilley.com`, passkey in 1Password) and adds prepaid funds.
  Agent records starting balance (via `GetAccountBalance` on the prod endpoint
  from Bux) before any HIT is created.
- **Tests:** n/a
- **Verification:** `GetAccountBalance` returns ≥ $5; value recorded for U5
  evidence.

### U4. Dry production dispatch with kill-switch rehearsal
- **Goal:** Confidence the guard and caps behave on Bux before money moves.
- **Requirements:** R2, R3
- **Files:** none (operational, on Bux)
- **Approach:** Start prod-profile bridge with `MTURK_ALLOW_PRODUCTION` unset →
  confirm refusal (U1 guard). Then set it, start, and run
  `npm run review -- --estimate` against the broker to confirm cost preview
  without dispatch. Document the abort path (delete HIT via
  `DeleteHIT`/`UpdateExpirationForHIT`) before dispatching anything.
- **Tests:** n/a
- **Verification:** Refusal log line captured; `--estimate` JSON captured.

### U5. The paid run
- **Goal:** R1 end-to-end with one paid assignment.
- **Requirements:** R1, R3, R4, R5
- **Files:** evidence only; commands per runbook
- **Approach:** From Bux:
  `npm run review -- --template binary_screenshot_check --question ... --screenshot <≤80KB jpeg> --risk low --no-wait --broker-url http://127.0.0.1:3200`,
  record `job_id`; monitor bridge polling; when an anonymous worker submits,
  `--resume <job_id> --wait` for the verdict. Expect minutes-to-hours
  turnaround; use the ntfy `agent_alerts` topic on completion rather than
  blocking a session.
- **Tests:** n/a (this is the test)
- **Verification:** CLI exit 0/1 with feedback JSON; assignment ID present in
  bridge `deliveredAssignmentIds` and broker ledger; `validate:mturk-phase6`
  with the new IDs returns `"status": "verified"`.

### U6. Payment evidence + proof doc
- **Goal:** Durable `docs/ops/mturk-production-paid-proof.md` proving money
  moved and the verdict was real.
- **Requirements:** R1, R5
- **Files:** `docs/ops/mturk-production-paid-proof.md`,
  `docs/ops/mturk-access.md` (update "last verified")
- **Approach:** Same receipt format as `docs/ops/mturk-sandbox-e2e-proof.md`,
  plus: approval call/assignment status `Approved`, `GetAccountBalance`
  before/after delta (reward + 20% fee), worker ID (pseudonymous), HIT ID, and
  the full feedback JSON. Note any disagreement-handling that occurred.
- **Tests:** n/a
- **Verification:** Doc cross-checked against ledger rows and AWS responses;
  committed via PR.

### U7. Regression: sim + sandbox still green
- **Goal:** R2 demonstrated, not asserted, after U1 lands.
- **Requirements:** R2
- **Files:** none
- **Approach:** Local `npm run validate:provider-e2e` and a live sim round-trip
  (`npm run dev` + `npm run dev:worker` + `npm run review ... --wait`); on Bux,
  restart the sandbox-profile bridge (no `MTURK_ALLOW_PRODUCTION`) and confirm
  clean startup.
- **Tests:** covered by U1 unit tests + these operational checks
- **Verification:** Exit 0 on both validations; sandbox bridge startup log.

## Prior learnings applied

- `docs/solutions/runtime/sim-worker-never-finalizes-verdict.md` — the local sim
  loop requires `npm run dev:worker`; U7's sim regression uses the two-process
  recipe, and stray stale workers must be killed before judging results.

## Deferred / out of scope

- Production consensus at medium/high risk tiers (3–5 paid workers) — after the
  1-worker proof.
- Deployed shared broker (`docs/ops/deployment.md`) — separate effort.
- Automated approval/rejection policy tuning and worker-block lists.
- Fail/ambiguous paid-path proof (sandbox covers it; paid version deferred).

## Open questions

- Production turnaround for a $0.15 binary screenshot HIT is unknown (minutes to
  many hours); U5 plans for async resume but the proof session may span a day.
- Whether the requester account needs production activation steps beyond funding
  (first-time prod requesters sometimes face review) — discovered at U3.
