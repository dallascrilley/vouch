# Bux MTurk verification runbook

Run on Bux where the MTurk AWS account is linked. Mac hosts return `AWS.AccountNotLinked`.

## Prerequisites

- Broker + MTurk bridge running (mturk-staging worktree or equivalent)
- `MTURK_BRIDGE_API_KEY` in env
- AWS CLI configured for sandbox (`MTURK_AWS_ENDPOINT_URL` if not default)

## Pass job (existing proof)

From `docs/ops/mturk-sandbox-e2e-proof.md`:

```bash
export PHASE6_HIT_ID=3EGKVCRQFXT8E0OD232RVG7ISQDBY7
export PHASE6_JOB_ID=job_fa7b9778-cfe6-4e54-9374-d6d0140f67ee
export PHASE6_REVIEW_TASK_ID=review_ffa5064f-d722-4e4e-848b-771d822ade23
export EXPECTED_AGENT_NEXT_ACTION=pass
export MTURK_BRIDGE_API_KEY="<from bridge env>"

npm run validate:mturk-phase6
```

Exit `0` + `"status": "verified"` means AWS assignments, bridge delivery, and broker feedback align.

## Ambiguous / fail case (remaining)

1. Dispatch a new human-review task (or reuse sandbox HIT tuned for ambiguous/fail).
2. Submit worker assignment on Bux sandbox.
3. Wait for bridge poll + broker callback.
4. Confirm `auto_advanced: false` on callback response (unclear/fail must stay manual).
5. POST consensus/adjudication per `provider-disagreement-regression` pattern.
6. Re-run `validate:mturk-phase6` with updated IDs and `EXPECTED_AGENT_NEXT_ACTION` matching outcome.

Capture proof in `docs/ops/` same format as `mturk-sandbox-e2e-proof.md`.

## Paid production run

Plan: `docs/plans/2026-06-11-feat-mturk-paid-production-proof-plan.md`. Real
money, real anonymous workers — every step below is deliberate.

### Preconditions (in order)

1. **Funding (human step):** prepaid HIT balance ≥ $5 on requester.mturk.com
   (Amazon account owning AWS `181596276354`, root `dallas@dallascrilley.com`).
2. **Balance receipt:** from Bux, record the starting balance before any HIT:
   `aws mturk get-account-balance --endpoint-url https://mturk-requester.us-east-1.amazonaws.com`
   (use the bridge checkout's `.env` credentials/tooling — see `mturk-access.md`).
3. **Guard rehearsal:** start the bridge with the production endpoint but
   *without* `MTURK_ALLOW_PRODUCTION` — it must refuse with
   `paid HITs require MTURK_ALLOW_PRODUCTION=true`. Capture the log line.

### Production env profile

Overlay on the existing Bux bridge `.env` (sandbox values stay the default —
keep this in a separate `env.production` you source explicitly, never in the
checked-in default env):

```bash
MTURK_AWS_ENDPOINT_URL=https://mturk-requester.us-east-1.amazonaws.com
MTURK_ALLOW_PRODUCTION=true
MTURK_BRIDGE_STATE_PATH=.runtime/mturk-bridge-state-production.json  # never mix with sandbox state
MTURK_REWARD=0.15
MTURK_MAX_REWARD_USD=0.25
MTURK_MAX_ASSIGNMENTS=1
MTURK_MAX_ASSIGNMENTS_PER_HIT=1
MTURK_MAX_SPEND_PER_HIT_USD=0.50
MTURK_EXPIRATION_SECONDS=86400
MTURK_TASK_DURATION_SECONDS=900
MTURK_ASSIGNMENT_APPROVAL_POLICY=approve_on_callback_success
MTURK_AUTO_APPROVAL_DELAY_SECONDS=259200
MTURK_QUALIFICATION_REQUIREMENTS_JSON='[{"QualificationTypeId":"000000000000000000L0","Comparator":"GreaterThanOrEqualTo","IntegerValues":[95]},{"QualificationTypeId":"00000000000000000040","Comparator":"GreaterThanOrEqualTo","IntegerValues":[100]}]'
```

(`000…L0` = Worker_PercentAssignmentsApproved ≥ 95; `000…0040` =
Worker_NumberHITsApproved ≥ 100.)

### Dispatch and resume

```bash
# cost preview first — no dispatch
npm run review -- --estimate --template binary_screenshot_check --risk low ...

# dispatch (exit immediately with job_id)
npm run review -- --template binary_screenshot_check \
  --question "<criterion-id>:<assertion>" \
  --screenshot <jpeg ≤80KB> --risk low --no-wait \
  --broker-url http://127.0.0.1:3200

# later (real workers take minutes-to-hours)
npm run review -- --resume <job_id> --broker-url http://127.0.0.1:3200 --wait
```

Abort path (before a worker accepts): expire the HIT —
`aws mturk update-expiration-for-hit --hit-id <id> --expire-at 0`, then
`delete-hit` once reviewable.

### Evidence to capture (for `docs/ops/mturk-production-paid-proof.md`)

- Guard-refusal log line, `--estimate` JSON, starting/ending
  `get-account-balance` (delta = reward + 20% fee), HIT ID, assignment ID +
  `Approved` status, pseudonymous worker ID, full CLI feedback JSON, and a
  `validate:mturk-phase6` `"status": "verified"` run with the new IDs.
