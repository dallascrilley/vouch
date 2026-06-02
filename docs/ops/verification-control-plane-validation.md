# Verification Control Plane Validation

## Commands

```bash
npm run lint
npm run build
npm test
```

## Current Evidence

- Lint passes on the TypeScript service, worker, and test surfaces.
- TypeScript build passes with `tsc --noEmit`.
- The test suite covers:
  - OpenAPI and event contracts
  - Foundational ledger and budget policy behavior
  - User Story 1 verification loop outcomes
  - User Story 2 human review, consensus, and adjudication
  - User Story 3 policy, metrics, retention, calibration, and budget-blocked behavior

## Quickstart Scenario

`tests/integration/quickstart-e2e.test.ts` exercises the documented quickstart:

1. Create a verification job
2. Attach artifact evidence
3. Record privacy classification
4. Submit self-verification results
5. Fetch final verdict
6. Fetch machine-readable feedback

Expected result: pass verdict with `allow` release-gate effect and `retry_allowed: false`.
