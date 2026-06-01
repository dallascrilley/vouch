# SQLite Local Runtime Validation

Validated on `002-sqlite-local-runtime` with:

```bash
npm run build
npm test
npm run validate:local-runtime
```

Observed proof:

- TypeScript compilation passed with the SQLite runtime enabled.
- `vitest` passed all current contract, integration, and unit coverage on the SQLite-backed runtime.
- `validate:local-runtime` completed the local persistence flow and printed `local runtime validation passed`.

The runtime uses Node `v22.22.2`, which currently exposes `node:sqlite` as an experimental API.
