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
