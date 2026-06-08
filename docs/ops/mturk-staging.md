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
- `MTURK_MAX_ASSIGNMENTS=1`
- `MTURK_REWARD=0.05`
- `MTURK_EXPIRATION_SECONDS=86400`
- `MTURK_TASK_DURATION_SECONDS=900`

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
- HIT lifetime and worker assignment duration are bounded by
  `MTURK_EXPIRATION_SECONDS` and `MTURK_TASK_DURATION_SECONDS`.
- Callback delivery retries are bounded by `MTURK_MAX_CALLBACK_ATTEMPTS`.
  Repeated failures are persisted in `deadLetterAssignments` inside
  `MTURK_BRIDGE_STATE_PATH` and are not retried indefinitely.
- Duplicate assignments are skipped using persisted `deliveredAssignmentIds`.
- Bridge logs include `hitId`, `assignmentId`, `reviewTaskId`, and `workerId`
  where available, so operators can trace HIT -> assignment -> callback -> job.

## Restart and recovery checks

1. Confirm both processes are healthy:
   `curl -sf http://127.0.0.1:3000/health` and
   `curl -sf http://127.0.0.1:3100/health`.
2. Inspect `MTURK_BRIDGE_STATE_PATH` and verify each active HIT has its
   `reviewTaskId`, `deliveredAssignmentIds`, `lastPollAt`, and any
   `deadLetterAssignments`.
3. Restart broker and bridge.
4. Re-check `MTURK_BRIDGE_STATE_PATH`; delivered assignment IDs should remain
   present and should not be posted again.
5. Submit or wait for one sandbox assignment and confirm the bridge records
   `lastDeliveryAt` and broker inspection advances beyond dispatched state.
