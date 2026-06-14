# Bux MTurk verification runbook

Run on Bux where the MTurk AWS account is linked. Mac hosts return `AWS.AccountNotLinked`.

## Prerequisites

- Broker + MTurk bridge running (mturk-staging worktree or equivalent)
- `MTURK_BRIDGE_API_KEY` in env
- AWS CLI configured for sandbox (`MTURK_AWS_ENDPOINT_URL` if not default)

## Pass job (existing proof)

Historical IDs from `docs/ops/mturk-sandbox-e2e-proof.md` (2026-06-10). Phase 6
only returns `"status": "verified"` if the broker still holds that job's
feedback — after broker DB reset or a new deployment, expect
`pending_feedback` and use a fresh sandbox dispatch instead.

```bash
export BROKER_BASE_URL=http://127.0.0.1:3200
export MTURK_BRIDGE_BASE_URL=http://127.0.0.1:3300
export PHASE6_HIT_ID=3EGKVCRQFXT8E0OD232RVG7ISQDBY7
export PHASE6_JOB_ID=job_fa7b9778-cfe6-4e54-9374-d6d0140f67ee
export PHASE6_REVIEW_TASK_ID=review_ffa5064f-d722-4e4e-848b-771d822ade23
export EXPECTED_AGENT_NEXT_ACTION=pass
export MTURK_BRIDGE_API_KEY="<from bridge env>"

npm run validate:mturk-phase6
```

Exit `0` + `"status": "verified"` means AWS assignments, bridge delivery, and
broker feedback align. For a live stack health check without historical IDs, run
`npm run validate:provider-e2e` (sim path).

## Ambiguous / fail case

**Offline proof (2026-06-14):** `docs/ops/mturk-sandbox-ambiguous-proof.md` +
`tests/fixtures/provider-return-path/mturk-sandbox-ambiguous-v1/`. Validates
`auto_advanced: false`, feedback 404 until adjudication, consensus → retry.

```bash
npm run validate:provider-proof-bundle -- mturk-sandbox-ambiguous-v1
```

Optional live Bux regression (replace simulated IDs in the proof bundle):

1. Dispatch a new human-review task (or reuse sandbox HIT tuned for ambiguous/fail).
2. Submit worker assignment on Bux sandbox.
3. Wait for bridge poll + broker callback.
4. Confirm `auto_advanced: false` on callback response (unclear/fail must stay manual).
5. POST consensus/adjudication per `provider-disagreement-regression` pattern.
6. Re-run `validate:mturk-phase6` with updated IDs and `EXPECTED_AGENT_NEXT_ACTION` matching outcome.

## Paid production run

Plan: `docs/plans/2026-06-11-feat-mturk-paid-production-proof-plan.md`. Real
money, real anonymous workers — every step below is deliberate.

### Preconditions (in order)

1. **Funding:** prod requester linked to AWS `181596276354` (see
   `mturk-access.md`). `create-hit` must succeed — available balance must cover
   reward + fee. New accounts often have only `$0.02` signup credit: use
   `--reward 0.01` on dispatch (template default `$0.10` fails with
   insufficient funds). Monthly quota on `181596276354` was already `$2500`
   (`crowdscale-usagelimitservice` / `L-EC45676A`); AWS-billing accounts cannot
   buy prepaid HITs on the portal.
2. **Balance receipt:** from Bux, record the starting balance before any HIT:
   `aws mturk get-account-balance --endpoint-url https://mturk-requester.us-east-1.amazonaws.com`
   (use the bridge checkout's `.env` credentials/tooling — see `mturk-access.md`).
3. **Guard rehearsal:** start the bridge with the production endpoint but
   *without* `MTURK_ALLOW_PRODUCTION` — it must refuse with
   `paid HITs require MTURK_ALLOW_PRODUCTION=true`. Capture the log line.

### Production env profile

Overlay on the existing Bux bridge `.env` (sandbox values stay the default).
Canonical copy: `docs/ops/env.production.example` → `env.production` in the
agent-loop checkout (never commit `env.production`).

```bash
cp docs/ops/env.production.example env.production
# stop sandbox bridge on :3300 first, then:
set -a && source .env && source env.production
nohup npx tsx scripts/mturk-bridge.ts >> .runtime/mturk-bridge-prod.log 2>&1 &
```

Qualification IDs in the example file: `000…L0` = Worker_PercentAssignmentsApproved
≥ 95; `000…0040` = Worker_NumberHITsApproved ≥ 100.

### Dispatch and resume

```bash
# cost preview first — no dispatch
npm run review -- --estimate --template binary_screenshot_check --risk low --reward 0.01 ...

# dispatch (exit immediately with job_id)
# On new accounts with only $0.02 signup credit, use --reward 0.01 (not the
# template default $0.10) so create-hit fits available balance + fee.
npm run review -- --template binary_screenshot_check \
  --question "<criterion-id>:<assertion>" \
  --screenshot <jpeg ≤80KB> --risk low --reward 0.01 --no-wait \
  --broker-url http://127.0.0.1:3200

# later (real workers take minutes-to-hours)
npm run review -- --resume <job_id> --broker-url http://127.0.0.1:3200 --wait
```

Abort path (before a worker accepts): expire the HIT —
`aws mturk update-expiration-for-hit --hit-id <id> --expire-at 0`, then
`delete-hit` once reviewable.

### Evidence (production paid proof — completed)

Captured in `docs/ops/mturk-production-paid-proof.md` (2026-06-14): guard,
estimate, balance delta, correlation IDs, assignment approval, CLI feedback,
`validate:mturk-phase6` verified. Re-run prod only after funding and switching
to `env.production` per sections above.

### Restore sandbox after prod proof

Default Bux posture is **sandbox** on `:3300` (`.env` only — no
`env.production`). Switch back when prod proof is done or balance is zero so
accidental paid dispatch cannot occur.

```bash
cd ~/Code/ai-human-review-broker-agent-loop
# stop whatever is on :3300 (prod overlay uses env.production)
pkill -f "tsx scripts/mturk-bridge.ts" || true
sleep 2
set -a && source .env
nohup npx tsx scripts/mturk-bridge.ts >> .runtime/mturk-bridge.log 2>&1 &
curl -sf http://127.0.0.1:3300/health
# expect MTURK_AWS_ENDPOINT_URL=sandbox in bridge process env
npm run -s validate:provider-e2e
```

Prod state stays in `.runtime/mturk-bridge-state-production.json`; sandbox uses
`.runtime/mturk-bridge-state.json`. Re-enable prod later with `source
env.production` per section above when funded.
