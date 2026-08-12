# Bridge health contract

Schema contract between the broker-side validators (`npm run validate:mturk-phase6`)
and any provider bridge that exposes a `GET /state` endpoint (the MTurk bridge lives
in `scripts/mturk-bridge.ts` + `scripts/lib/provider-bridge.ts`).

## Per-task fields

Each entry in `tasks` (array or keyed object) describes one provider task (MTurk HIT):

| Field | Type | Meaning |
|-------|------|---------|
| `hitId` | string | Provider task id (HIT id) |
| `reviewTaskId` | string | Broker review task the HIT was dispatched for |
| `deliveredAssignmentCount` / `deliveredAssignmentIds` | number / string[] | Assignments successfully POSTed to `/provider-callback` |
| `deliveryComplete` | boolean | Every expected assignment (HIT `MaxAssignments`) delivered to the broker; the bridge stops polling this HIT |
| `deliveryCompletedAt` | ISO timestamp | When `deliveryComplete` flipped true |
| `deliveryLagMs` | number | Worker `SubmitTime` → broker delivery latency for the most recent delivery |
| `lastPollAt` | ISO timestamp | Last `list-assignments-for-hit` attempt for this HIT |
| `nextPollAt` | ISO timestamp | Present only while backing off after throttling; no polls before this time |
| `throttleEvents` | array | Recent throttling incidents: `{ message, recordedAt, nextPollAt }` (last 10 kept) |
| `lastError` | object | Most recent poll/delivery error: `{ message, recordedAt }` |

`totals.deliveryCompleteTasks` counts tasks with `deliveryComplete: true`.

Dead letters appear both per task (`deadLetterAssignments`) and aggregated under
`deadLetters`: `{ assignmentId, attempts, reason, recordedAt, workerId }` — callbacks
that exhausted `MTURK_MAX_CALLBACK_ATTEMPTS`.

## Behavior guarantees

- **Delivery-complete short circuit.** Once `deliveryComplete` is true the bridge stops
  calling `list-assignments-for-hit` for that HIT, eliminating post-delivery throttle
  noise. Validators must not require fresh `lastPollAt` values for completed tasks.
- **Throttle backoff.** On AWS throttling (`ThrottlingException`, "Rate exceeded",
  `RequestLimitExceeded`), the bridge doubles the per-HIT poll interval starting from
  `MTURK_POLL_INTERVAL_MS`, capped at `MTURK_MAX_POLL_BACKOFF_MS` (default 300000), and
  records a `throttleEvents` entry. A successful poll clears `nextPollAt`/backoff.
- **Late assignments (edge case).** Assignments that appear after `deliveryComplete`
  (e.g. a HIT extended with more assignments) are NOT picked up by default. Set
  `MTURK_REPOLL_COMPLETED=true` on the bridge to re-enable polling of completed HITs;
  the dedupe receipt store on the broker keeps redelivery idempotent.

## Validator behavior

`scripts/verify-mturk-phase6-run.ts` asserts these fields when present:

- `deliveryComplete` must be a boolean, `deliveryLagMs` a non-negative number,
  `throttleEvents` an array — type violations fail the run (exit 6, `status:
  "bridge_health_schema_violation"`).
- When `deliveryComplete` is true and assignments are delivered, the run no longer
  reports `bridge_task_missing_or_stale_using_aws_and_feedback`.
- The JSON result includes a `bridge_health` block echoing the fields above for
  proof-doc capture.

