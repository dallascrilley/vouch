# Runtime Target vs Current Implementation

## Current (shipped)

The broker runs as a **SQLite-first local runtime** on Node.js 24+:

- Structured state: `node:sqlite` databases (`RUNTIME_SQLITE_PATH`, `PROVIDER_SQLITE_PATH`)
- Queue: `SQLiteLocalQueueStore` in the runtime database (not pg-boss)
- Artifacts: manifests and refs in SQLite; the filesystem artifact root is
  validated and inspectable, but no blob `ArtifactStore` is wired
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

## Migration decision

RFC 0001 selects an ambient transaction context for the future asynchronous
persistence adapter: the adapter binds its pooled connection with
`AsyncLocalStorage` while `TransactionManager.inTransaction` runs. This keeps
the provider-neutral repository ports unchanged.

That decision does not mean PostgreSQL support is shipped. The first pooled
adapter must still prove that repository calls inside and outside a transaction
use the correct connections before production persistence is considered ready.
Until then, SQLite remains the only implemented and verified runtime.

## Rule for agents

- Treat the README and this doc as the source of truth for what runs today.
- Treat `docs/architecture/verification-control-plane.md` as the implemented
  control-plane flow (SQLite-backed). The PostgreSQL / pg-boss / S3 / OTel
  shape in this file is the **unbuilt** production target, not current `src/`.
- Do not assume PostgreSQL, pg-boss, S3, or OTel are available without checking `src/`.
