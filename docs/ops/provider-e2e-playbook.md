# Provider E2E Playbook (Sandbox)

Prove the full return path: worker submission → bridge callback → broker state → verdict/feedback.

Prerequisites: broker running with real provider enabled, MTurk bridge on Bux, sandbox credentials in env (never commit).

## Phase 1 — First truthful receipt

### 1. Dispatch from broker

Create a verification job and human-review task through the normal API or `npm run validate:provider`.
Record `job_id`, `review_task_id`, `provider_task_id`.

### 2. Submit sandbox assignment

Submit 1–2 existing sandbox HITs as a worker (one pass, one ambiguous if possible).

### 3. Confirm MTurk-side submission

On Bux:

```bash
aws mturk list-assignments-for-hit --hit-id <HIT_ID>
```

### 4. Confirm bridge ingestion

From the mturk-staging worktree:

```bash
curl -sf -H "authorization: Bearer $MTURK_BRIDGE_API_KEY" http://127.0.0.1:3100/state
```

Check `.runtime/mturk-bridge-state.json` for `lastPollAt`, `lastDeliveryAt`, `deliveredAssignmentIds`.
Bridge logs should show poll + successful callback POST.

### 5. Confirm broker mutation

```bash
curl -s "http://localhost:3000/runtime/inspection/jobs/<job_id>" | jq .
```

Expect:

- `review_tasks[].state` beyond pure dispatch
- normalized human response present
- ledger includes response transition

### 6. Capture proof bundle

Save to `docs/ops/provider-integration-proof.md` (no secrets):

- HIT ID, assignment ID, job ID
- inspection JSON snapshot
- relevant bridge/broker log lines

**Phase 1 done when:** at least one real sandbox assignment ingested with response evidence in inspection.

## Phase 2 — Verdict and feedback

1. If consensus/adjudication does not auto-run, POST contract payloads manually.
2. Verify outcome matches worker response (clean pass vs retry/adjudication case).
3. Confirm machine-readable surfaces:

```bash
curl -s "http://localhost:3000/verification-jobs/<job_id>/verdict" | jq .
curl -s "http://localhost:3000/verification-jobs/<job_id>/feedback" | jq .
```

4. Record operator cycle: dispatch → worker submit → ingestion → verdict → feedback.

**Phase 2 done when:** one job reaches truthful post-response outcome with agent-actionable verdict/feedback.

## Simulated proof (no MTurk)

In-repo mock path — dispatch → callback → auto-advance → pass verdict:

```bash
npm run validate:provider-e2e
```

Covers Phase 3 automation for **pass** callbacks. Unclear/fail responses still need manual consensus/adjudication.

## Phase 3 — Sandbox proof

**Pass case (done):** `docs/ops/mturk-sandbox-e2e-proof.md` — real sandbox assignment → bridge → verdict pass.

**Remaining:** ambiguous/fail sandbox HIT on Bux; `validate:mturk-phase6` AWS list step on Bux.

Summary: `docs/ops/provider-integration-proof.md`, `docs/planning/goalplan.md`.
