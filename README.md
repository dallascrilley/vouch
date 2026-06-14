# AI Human Review Broker

Contract-first TypeScript service for verification job intake, privacy gating,
self-verification, human review orchestration, consensus, adjudication, verdict
ledgering, and machine-readable feedback.

## Prerequisites

- **Node.js 24+** (required by `engines` and CI). Recommended setup:

```bash
mise install   # reads .mise.toml
npm ci
```

Without mise, use any Node 24 install and ensure `node -v` reports v24+ before `npm ci`.

## Commands

Canonical entrypoints (bootstrap): `script/setup`, `script/test`, `script/cibuild`
(or `just setup`, `just test`, `just cibuild`). `script/cibuild` mirrors CI's broker
gate (`npm ci`, `build:js`, `verify`, OpenAPI version check).

- `npm run lint`
- `npm run build`
- `npm run build:js` — emit runnable JS to `dist/`
- `npm test`
- `npm run dev`
- `npm start` — run the compiled API server (`dist/api/server.js`)
- `npm run start:worker` — run the compiled dispatch worker
- `npm run validate:local-runtime`
- `npm run validate:provider`
- `npm run validate:provider-e2e` — simulated dispatch → callback → pass verdict
- `npm run verify` — run lint + build + tests through the broker and gate on the verdict

## Agent integration

Agents commission human review with one command. Start the API **and** dispatch worker locally:

```bash
npm run dev          # terminal 1 — API
npm run dev:worker   # terminal 2 — provider dispatch
npm run review -- --help
```

Example visual QA:

```bash
npm run review -- \
  --template binary_screenshot_check \
  --question "hero-visible:The hero headline is visible." \
  --screenshot path/to/screenshot.png \
  --risk medium --wait
```

Exit codes map to `agent_next_action` (0 pass, 1 fail, 2 retry, 3 recapture, 4 escalate, 5 pending). stdout is JSON with `job_id`, `feedback`, and repair hints.

Full integration guide: [docs/architecture/agent-loop-integration.md](docs/architecture/agent-loop-integration.md). Wire contract: [docs/architecture/agent-review-contract.md](docs/architecture/agent-review-contract.md). Project context for agents: [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md).

## Dev Workflow Gate

`npm run verify` routes lint, typecheck, and tests through the broker's
self-verification lifecycle. CI runs `./script/cibuild`, which includes `verify`
plus an OpenAPI version check (lychee link check runs only in GitHub Actions).
Set `BROKER_URL` to record verdicts in a deployed broker. See
`docs/ops/dev-workflow-integration.md`.

## Deployment

The service builds into a single container image (`Dockerfile`, Node 24 base):

```bash
docker build -t ai-human-review-broker:latest .
docker run -d -p 3000:3000 -v broker-data:/data \
  -e RUNTIME_OPERATOR_TOKEN="$(openssl rand -hex 32)" \
  ai-human-review-broker:latest
```

The server exposes an unauthenticated `GET /health` for liveness, persists state
under `/data`, and shuts down cleanly on `SIGTERM`. Full guidance, including the
dispatch worker and security-relevant configuration
(`RUNTIME_OPERATOR_TOKEN`, `PROVIDER_SHARED_SECRET`), is in
`docs/ops/deployment.md`.

## Current Scope

- User Story 1: end-to-end verification loop with pass, retry, recapture, and fail-closed outcomes
- User Story 2: human review task creation, response ingestion, consensus, and adjudication
- User Story 3: externalization policy, provider routing, retention, metrics, calibration, and budget-blocked ledger events

## Local Runtime

- Structured verification state persists in SQLite via `RUNTIME_SQLITE_PATH`.
- Local artifact and inspection paths live under `RUNTIME_ARTIFACT_ROOT`.
- Runtime inspection endpoints are available at `/runtime/inspection` and `/runtime/inspection/jobs/:jobId`.

## Validation

The SQLite local-runtime proof is documented in
`docs/ops/sqlite-local-runtime-validation.md`.

Provider integration validation is documented in
`docs/ops/provider-integration-validation.md`, with local setup guidance in
`docs/ops/provider-integration-local-setup.md`.

Sandbox E2E proof steps (worker submit through verdict) are in
`docs/ops/provider-e2e-playbook.md`.

## Local Provider Hygiene

- Keep `.env*`, provider callback secrets, and local validation logs out of the repository.
- Treat `provider-integration-proof.md` as evidence-only; never paste raw tokens or live callback payload secrets into docs.

## Agent / project context

- `PROJECT_CONTEXT.md` — durable facts for agents (stack, envs, constraints).
- `AGENTS.md` — commands, conventions, hub skill references.
- `pre-commit install` — optional local hook (eslint + file hygiene); not required for CI.
