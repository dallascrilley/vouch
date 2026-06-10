# Runtime Target vs Current Implementation

## Current (shipped)

The broker runs as a **SQLite-first local runtime** on Node.js 24+:

- Structured state: `node:sqlite` databases (`RUNTIME_SQLITE_PATH`, `PROVIDER_SQLITE_PATH`)
- Queue: `SQLiteLocalQueueStore` in the runtime database (not pg-boss)
- Artifacts: `LocalArtifactStore` on the filesystem (`RUNTIME_ARTIFACT_ROOT`)
- Metrics: `InMemoryMetricsRecorder` (no OpenTelemetry export yet)
- Providers: real adapter + simulated local mode for tests and dev

This path supports zero-infra local dev, Docker deployment, and the repo's
`npm run verify` dogfooding gate.

## Production target (spec 001)

The original verification-control-plane spec planned:

- PostgreSQL for durable job/policy/response/ledger state
- pg-boss for asynchronous worker retries
- S3-compatible object storage for artifacts
- OpenTelemetry metrics and tracing

Those adapters are **not implemented** in `src/` yet. Dependencies were removed
from `package.json` until adapters land; re-add them when implementing the
production persistence layer.

## Rule for agents

- Treat README, `AGENTS.md`, and this doc as the source of truth for what runs today.
- Treat `specs/001-verification-control-plane/plan.md` as the **target** architecture.
- Do not assume PostgreSQL, pg-boss, S3, or OTel are available without checking `src/`.
