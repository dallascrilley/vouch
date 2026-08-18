# Human-review task idempotency

`POST /verification-jobs/:jobId/human-review-tasks` treats `idempotency_key`
as the identity of **one** review task. A retry with the same key and the
same identifying parameters returns that task. A retry that changes those
parameters is rejected; the stored row is not rewritten.

## Intent

- Stop a caller from asserting one reviewer pool, package, or criterion set
  while dispatch continues against a different stored task.
- Keep legitimate dispatch retries (same key, same identifying fields) cheap
  and safe, including a refreshed `deadline_at`.

## Compared on replay

`HumanReviewTaskService.createOrGet` looks up the key, then
`assertReplayMatches` compares these fields to the stored task:

| Request field          | Compared   | Notes                                             |
| ---------------------- | ---------- | ------------------------------------------------- |
| `job_id`               | yes        | URL `jobId` versus stored `jobId`                 |
| `reviewer_pool`        | yes        |                                                   |
| `sanitized_package_id` | yes        |                                                   |
| `task_template`        | yes        | exact string, including JSON pricing envelopes    |
| `quality_policy`       | yes        |                                                   |
| `provider_adapter`     | if present | omitted on replay is not a mismatch               |
| `criterion_ids`        | yes        | order-insensitive                                 |
| `deadline_at`          | no         | a retry may carry a refreshed deadline            |
| `visual_evidence`      | no         | addressed by `sanitized_package_id`, which is yes |

No key in the body: every call creates a new task. Real dispatch with
`VOUCH_REAL_SPEND_CEILING_USD` set then requires a key; see
[`docs/ops/spend-ceiling.md`](../ops/spend-ceiling.md).

## HTTP status

The human-review route maps any error whose message contains
`"idempotency key"` to **403** `{ message }`. That includes a missing key
when the spend ceiling is set, and a replay whose identifying fields differ.
This path does not return 409; that status exists on
`POST /verification-jobs` in OpenAPI and is a different contract.

Matching replay returns **202** and the stored `review_task_id`. If the
stored task is still `queued` and the configured real provider is enabled,
the route retries dispatch (`canRetryRealDispatch` in
`src/api/routes/human-review.ts`). An already-dispatched match returns 202
without a second paid create.

## Contrast

| Surface                        | Replay with a different payload                                     |
| ------------------------------ | ------------------------------------------------------------------- |
| Human-review task              | 403; stored task unchanged                                          |
| Spend reservation              | throws if `job_id` or `amount_usd` differ                           |
| Verification job `createOrGet` | returns the existing job; does **not** compare the rest of the body |

## Pitfalls

- Changing work needs a **new** key. Reusing the old key with a new
  `sanitized_package_id` or `criterion_ids` 403s; it does not start a
  second paid task.
- Omitting `provider_adapter` on a replay is allowed even when the stored
  task has an adapter. Sending a _different_ adapter is not.
- 403 on this route does not always mean "no row". Privacy and spend
  rejections persist the task first, then fail. Replay-mismatch 403s leave
  the original row in place.
- Job-level keys are a different contract. `POST /verification-jobs` still
  reuses by key alone.

The Pi extension derives its key from criteria, artifact hashes, template,
pool, and simulated-versus-real mode, so unchanged work re-attaches and
changed work gets a new key. See [`extensions/pi/README.md`](../../extensions/pi/README.md).

## Proof

- Mismatch rejected: `tests/integration/security-regression.test.ts`
  ("rejects an idempotency replay that changes a task-identifying
  parameter").
- Matching replay keeps one row:
  `tests/contract/human-review-task-contract.test.ts`.

Code: `src/domain/human-review/human-review-task-service.ts`
(`assertReplayMatches`), `src/api/routes/human-review.ts`.
