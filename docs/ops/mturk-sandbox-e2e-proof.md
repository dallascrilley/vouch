# MTurk Sandbox E2E Proof — Phase 1 Receipt

Captured from persisted runtime state in the `mturk-staging` worktree on 2026-06-09,
then live re-verified with broker + bridge restarted against the same `.runtime/` files.
Initial offline evidence: `.runtime/local-runtime.sqlite` and `.runtime/mturk-bridge-state.json`.
Assignment existence is corroborated by bridge `deliveredAssignmentIds` and broker
`providerResponseId`, not a fresh `aws mturk list-assignments-for-hit` on this Mac
(`AWS.AccountNotLinked`; run that step on Bux).

> Synced into main repo 2026-06-09. This job used pre–auto-advance adjudication
> (`retry_reason: provider_callback_auto_resolution`). Current `main` pass callbacks use
> `provider_response_auto_advance` via `ProviderWorkflowService`.

## Summary

One real sandbox worker assignment was submitted, polled by the bridge, delivered to the broker
via provider callback, and advanced through consensus and adjudication to a final pass with
agent-facing feedback.

| Check | Result |
|-------|--------|
| Sandbox assignment ingested | yes — assignment `39DD6S19JQC8DD8WYIB2ZFIKGVUEZ7` in bridge + broker |
| Bridge delivered callback | yes — `lastDeliveryAt` 2026-06-08T22:08:16.947Z |
| Broker human response recorded | yes — `response_1de99fdc-1242-4a4b-9dbe-857909f7a2f1` |
| Ledger shows response transition | yes — `external_review_queued -> human_responses_received` |
| Verdict + feedback populated | yes — `final_verdict: pass`, `agent_next_action: pass` (API shape) |

## Correlation IDs

| Field | Value |
|-------|-------|
| HIT ID | `3EGKVCRQFXT8E0OD232RVG7ISQDBY7` |
| Assignment ID | `39DD6S19JQC8DD8WYIB2ZFIKGVUEZ7` |
| Worker pseudonym | `ASBEMCXX9AKTR` |
| Job ID | `job_fa7b9778-cfe6-4e54-9374-d6d0140f67ee` |
| Review task ID | `review_ffa5064f-d722-4e4e-848b-771d822ade23` |
| Human response ID | `response_1de99fdc-1242-4a4b-9dbe-857909f7a2f1` |
| Sanitized package ID | `mturk-visual-hero-cta-phase6-20260608-165838-package` |
| Criterion | `hero-cta-no-overlap` |

## Bridge state (2026-06-08)

From `.runtime/mturk-bridge-state.json`:

- `deliveredAssignmentIds`: `["39DD6S19JQC8DD8WYIB2ZFIKGVUEZ7"]`
- `callbackAttempts`: 1 for that assignment
- `lastPollAt`: `2026-06-08T22:10:10.269Z`
- `lastDeliveryAt`: `2026-06-08T22:08:16.947Z`
- `hitStatus`: `Reviewable`
- `deadLetterAssignments`: `[]`

Note: bridge later hit AWS `ThrottlingException` on `list-assignments-for-hit` at
`2026-06-08T22:08:31.864Z`. Delivery had already succeeded.

## Broker ledger chain

Job `job_fa7b9778-cfe6-4e54-9374-d6d0140f67ee` (newest first; full chain in sqlite):

1. `adjudication_required -> final_pass` (2026-06-08T22:08:16.943Z)
2. `consensus_running -> adjudication_required` (2026-06-08T22:08:16.943Z)
3. `human_responses_received -> consensus_running` (2026-06-08T22:08:16.942Z)
4. `external_review_queued -> human_responses_received` (2026-06-08T22:08:16.939Z) ← provider callback receipt
5. `privacy_classified -> external_review_queued` (2026-06-08T21:58:39.159Z)
6. earlier create / artifact / privacy / externalization events (2026-06-08T21:58:39.156Z–158Z)

Post-callback transitions completed within ~4ms, consistent with automatic orchestration
(`retry_reason: provider_callback_auto_resolution` on feedback API).

## Normalized human response (sqlite excerpt)

Internal persisted shape (`human_responses.payload_json`):

```json
{
  "responseId": "response_1de99fdc-1242-4a4b-9dbe-857909f7a2f1",
  "reviewTaskId": "review_ffa5064f-d722-4e4e-848b-771d822ade23",
  "providerId": "real-provider",
  "providerResponseId": "39DD6S19JQC8DD8WYIB2ZFIKGVUEZ7",
  "reviewerPseudonymousId": "ASBEMCXX9AKTR",
  "overallVerdict": "pass",
  "criterionResults": [
    { "criterionId": "hero-cta-no-overlap", "confidence": "high", "status": "pass" }
  ]
}
```

## Agent completion contract

HTTP API shape (`GET /verification-jobs/:jobId/feedback` returns snake_case):

```json
{
  "final_verdict": "pass",
  "agent_next_action": "pass",
  "failed_criteria": [],
  "human_annotations": ["39DD6S19JQC8DD8WYIB2ZFIKGVUEZ7"],
  "retry_allowed": false,
  "retry_reason": "provider_callback_auto_resolution"
}
```

## Re-verify (when broker is up)

From the mturk-staging worktree with the same `.runtime/` paths:

```bash
curl -sf http://127.0.0.1:3000/health
curl -sf http://127.0.0.1:3100/health
curl -sf -H "authorization: Bearer $MTURK_BRIDGE_API_KEY" http://127.0.0.1:3100/state
curl -sf http://127.0.0.1:3000/runtime/inspection/jobs/job_fa7b9778-cfe6-4e54-9374-d6d0140f67ee
curl -sf http://127.0.0.1:3000/verification-jobs/job_fa7b9778-cfe6-4e54-9374-d6d0140f67ee/verdict
curl -sf http://127.0.0.1:3000/verification-jobs/job_fa7b9778-cfe6-4e54-9374-d6d0140f67ee/feedback
```

Scripted verifier (requires live broker + bridge + AWS creds):

```bash
PHASE6_HIT_ID=3EGKVCRQFXT8E0OD232RVG7ISQDBY7 \
PHASE6_JOB_ID=job_fa7b9778-cfe6-4e54-9374-d6d0140f67ee \
PHASE6_REVIEW_TASK_ID=review_ffa5064f-d722-4e4e-848b-771d822ade23 \
MTURK_BRIDGE_API_KEY="$MTURK_BRIDGE_API_KEY" \
npm run validate:mturk-phase6
```

## Live re-verification (2026-06-09)

Broker and bridge restarted from the mturk-staging worktree against the same `.runtime/` sqlite
and bridge state files. This Mac host has no linked MTurk AWS account (`AWS.AccountNotLinked`);
AWS-side assignment listing must still run on Bux.

| Check | Result |
|-------|--------|
| `GET /health` | `status: ok`, `database_path: .runtime/local-runtime.sqlite` |
| `GET /runtime/inspection/jobs/:jobId` | job found; 1 review task in `responses_received`; 8 ledger events (inspection uses camelCase domain fields) |
| `GET /verification-jobs/:jobId/verdict` | `final_verdict: pass` |
| `GET /verification-jobs/:jobId/feedback` | `agent_next_action: pass`, `retry_reason: provider_callback_auto_resolution` |
| `GET /state` (bridge) | 1 task; `deliveredAssignmentCount: 1`; same `lastDeliveryAt` |
| `npm run validate:mturk-phase6` | blocked here — AWS account not linked on this host |

## Phase 1 acceptance

- [x] At least one real sandbox assignment submitted
- [x] Bridge polled and posted normalized callback successfully
- [x] Broker inspection data shows response evidence beyond dispatched state

## Next

Phase 2 largely satisfied for this pass job (verdict + feedback exist). Remaining high-value work:

1. ~~Re-run live inspection/verdict/feedback curls after restart~~ **Done** — 2026-06-09 on Mac (see above).
2. Run `validate:mturk-phase6` on Bux (AWS assignment list step).
3. Submit a second sandbox case (ambiguous/fail) to exercise retry/adjudication semantics.
4. Phase 3 — add regression tests pinning post-ingestion auto-orchestration (pass case already advanced within ~4ms of callback).
