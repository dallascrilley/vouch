# AI Human Review Broker

Contract-first TypeScript service for verification job intake, privacy gating,
self-verification, human review orchestration, consensus, adjudication, verdict
ledgering, and machine-readable feedback.

## Commands

- `npm run lint`
- `npm run build`
- `npm test`
- `npm run dev`
- `npm run validate:local-runtime`
- `npm run validate:provider`

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

## Local Provider Hygiene

- Keep `.env*`, provider callback secrets, and local validation logs out of the repository.
- Treat `provider-integration-proof.md` as evidence-only; never paste raw tokens or live callback payload secrets into docs.
