# AI Human Review Broker

Contract-first TypeScript service for verification job intake, privacy gating,
self-verification, human review orchestration, consensus, adjudication, verdict
ledgering, and machine-readable feedback.

## Commands

- `npm run lint`
- `npm run build`
- `npm test`
- `npm run dev`

## Current Scope

- User Story 1: end-to-end verification loop with pass, retry, recapture, and fail-closed outcomes
- User Story 2: human review task creation, response ingestion, consensus, and adjudication
- User Story 3: externalization policy, provider routing, retention, metrics, calibration, and budget-blocked ledger events

## Validation

The current quickstart validation path is implemented in
`tests/integration/quickstart-e2e.test.ts` and documented in
`docs/ops/verification-control-plane-validation.md`.
