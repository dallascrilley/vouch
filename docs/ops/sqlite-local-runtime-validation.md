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

The runtime requires Node.js 24+ (`node:sqlite` is stable in this project's engine range).
Validated on Node `v24.16.0` with `npm run build`, `npm test`, and `npm run validate:local-runtime`.
