# MTurk Staging Setup

This repo does not speak Amazon Mechanical Turk directly. The staging setup uses
a local bridge process on Bux:

- broker API on `127.0.0.1:3000`
- MTurk bridge on `127.0.0.1:3100`
- bridge dispatches HITs with AWS CLI
- bridge polls submitted assignments and posts normalized callbacks to the broker

## Required environment

Broker:

- `PROVIDER_ENABLED=true`
- `PROVIDER_ID=real-provider`
- `PROVIDER_DISPATCH_MODE=api`
- `PROVIDER_INGESTION_MODE=callback`
- `PROVIDER_API_KEY=<shared bridge api key>`
- `PROVIDER_DISPATCH_URL=http://127.0.0.1:3100/dispatch`
- `PROVIDER_CALLBACK_BASE_URL=http://127.0.0.1:3000`
- `PROVIDER_SHARED_SECRET=<shared callback secret>`
- `PROVIDER_SQLITE_PATH=.runtime/provider-state.sqlite`
- `RUNTIME_SQLITE_PATH=.runtime/local-runtime.sqlite`
- `RUNTIME_OPERATOR_TOKEN=<operator token>`

Bridge:

- `MTURK_BRIDGE_API_KEY=<same as PROVIDER_API_KEY>`
- `PROVIDER_SHARED_SECRET=<same callback secret>`
- `MTURK_BROKER_CALLBACK_URL=http://127.0.0.1:3000/provider-callback`
- `MTURK_AWS_ENDPOINT_URL=https://mturk-requester-sandbox.us-east-1.amazonaws.com`
- `MTURK_AWS_REGION=us-east-1`
- `MTURK_BRIDGE_STATE_PATH=.runtime/mturk-bridge-state.json`
- `MTURK_POLL_INTERVAL_MS=15000`
- `MTURK_MAX_CALLBACK_ATTEMPTS=3`
- `MTURK_QUALIFICATION_REQUIREMENTS_JSON=[]`
- `MTURK_ASSIGNMENT_APPROVAL_POLICY=manual`
- `MTURK_MAX_ASSIGNMENTS=1`
- `MTURK_MAX_ASSIGNMENTS_PER_HIT=3`
- `MTURK_MAX_REWARD_USD=1`
- `MTURK_MAX_SPEND_PER_HIT_USD=3`
- `MTURK_REWARD=0.05`
- `MTURK_EXPIRATION_SECONDS=86400`
- `MTURK_MIN_EXPIRATION_SECONDS=300`
- `MTURK_TASK_DURATION_SECONDS=900`
- `MTURK_MIN_TASK_DURATION_SECONDS=60`
- `MTURK_AUTO_APPROVAL_DELAY_SECONDS=259200`
- `MTURK_MIN_AUTO_APPROVAL_DELAY_SECONDS=86400`

## Start order

1. `npm ci`
2. start broker: `npm run dev`
3. start bridge: `npm run mturk:bridge`
4. seed staging jobs: `npm run seed:mturk-staging`

## Test case pack

The staging seeder creates five synthetic jobs:

1. ambiguous desktop overlap regression
2. focus-ring ambiguity on modal CTA
3. empty-state copy clarity
4. visible staged pricing mismatch
5. mobile navigation clipping

All are synthetic or staging-only and safe for managed external review.

## Operational controls

- Polling is controlled by `MTURK_POLL_INTERVAL_MS`.
- Assignment fan-out and spend per HIT are bounded by `MTURK_MAX_ASSIGNMENTS`
  and `MTURK_REWARD`. Keep sandbox values low unless a test explicitly needs
  multiple independent workers.
- Startup fails before any AWS call if `MTURK_MAX_ASSIGNMENTS`,
  `MTURK_REWARD`, or their product exceed `MTURK_MAX_ASSIGNMENTS_PER_HIT`,
  `MTURK_MAX_REWARD_USD`, or `MTURK_MAX_SPEND_PER_HIT_USD`.
- HIT lifetime and worker assignment duration are bounded by
  `MTURK_EXPIRATION_SECONDS` and `MTURK_TASK_DURATION_SECONDS`.
- Startup also enforces minimum HIT lifetime, assignment duration, and
  auto-approval delay with `MTURK_MIN_EXPIRATION_SECONDS`,
  `MTURK_MIN_TASK_DURATION_SECONDS`, and
  `MTURK_MIN_AUTO_APPROVAL_DELAY_SECONDS`.
- Every poll refreshes MTurk HIT status with `aws mturk get-hit` and persists
  `hitStatus`, `hitReviewStatus`, `hitExpirationAt`, and `lastHitStatusAt`.
  When the HIT expiration timestamp has passed, the bridge records `expiredAt`
  and exposes the task in `/state` as expired while still polling assignments
  so late submitted/reviewable assignments can be ingested. HIT status refresh
  failures are recorded in `lastHitStatusError` and do not block assignment
  polling.
- Worker eligibility is controlled by `MTURK_QUALIFICATION_REQUIREMENTS_JSON`.
  Leave it empty (`[]`) for requester-sandbox smoke tests with a known worker
  account. For broader sandbox or production-like tests, pass a JSON array in
  the AWS `QualificationRequirement` shape and verify `/state` reports
  `qualificationRequirementCount > 0` for new HITs. Typical production rules
  should include approval-rate, completed-HIT count, locale, and any custom UI
  QA qualification before public-crowd use.
- Callback delivery retries are bounded by `MTURK_MAX_CALLBACK_ATTEMPTS`.
  Repeated failures are persisted in `deadLetterAssignments` inside
  `MTURK_BRIDGE_STATE_PATH` and are not retried indefinitely.
- Assignment approval is controlled by `MTURK_ASSIGNMENT_APPROVAL_POLICY`.
  Use `manual` to leave submitted assignments for requester-side approval.
  Use `approve_on_callback_success` only when the bridge should call
  `aws mturk approve-assignment` after the broker accepts the callback.
  Approval errors are recorded in `lastApprovalError`; callback delivery remains
  delivered once the broker has accepted the response. Delivered-but-unapproved
  assignments are retried on later polls when automatic approval is enabled.
- Duplicate assignments are skipped using persisted `deliveredAssignmentIds`.
- Duplicate approvals are skipped using persisted `approvedAssignmentIds`.
- Bridge logs include `hitId`, `assignmentId`, `reviewTaskId`, and `workerId`
  where available, so operators can trace HIT -> assignment -> callback -> job.

## Operator inspection

The bridge exposes local-only inspection endpoints protected by the same bearer
token as dispatch:

```bash
curl -sf -H "authorization: Bearer $MTURK_BRIDGE_API_KEY" \
  http://127.0.0.1:3100/state

curl -sf -H "authorization: Bearer $MTURK_BRIDGE_API_KEY" \
  http://127.0.0.1:3100/dead-letters
```

Use `/state` to inspect task counts, delivered assignment counts, approved
assignment counts, expired task counts, HIT status/review status, HIT
expiration, last HIT status refresh, last poll time, last delivery time, last
approval time, qualification restriction counts, last HIT status error, last
callback error, and last approval error. Use `/dead-letters` to inspect
assignments that exhausted callback delivery attempts.

## Restart and recovery checks

1. Confirm both processes are healthy:
   `curl -sf http://127.0.0.1:3000/health` and
   `curl -sf http://127.0.0.1:3100/health`.
2. Inspect `MTURK_BRIDGE_STATE_PATH` and verify each active HIT has its
   `reviewTaskId`, `hitStatus`, `hitExpirationAt`, `lastHitStatusAt`,
   `deliveredAssignmentIds`, `lastPollAt`, and any `deadLetterAssignments`.
3. Restart broker and bridge.
4. Re-check `MTURK_BRIDGE_STATE_PATH`; delivered assignment IDs should remain
   present and should not be posted again.
5. Submit or wait for one sandbox assignment and confirm the bridge records
   `lastDeliveryAt` and broker inspection advances beyond dispatched state.
6. If `MTURK_ASSIGNMENT_APPROVAL_POLICY=approve_on_callback_success`, confirm
   `approvedAssignmentIds` and `lastApprovalAt` are persisted for the assignment.
