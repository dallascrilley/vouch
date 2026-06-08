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
