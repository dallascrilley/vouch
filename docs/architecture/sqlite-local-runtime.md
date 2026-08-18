# SQLite Local Runtime

`002-sqlite-local-runtime` replaces the in-memory runtime with a single-machine SQLite-backed store while keeping the existing Fastify route contracts stable.

## Runtime Surfaces

- Structured verification state lives in `RUNTIME_SQLITE_PATH` and is initialized through `src/adapters/storage/sqlite-migrations.ts`.
- Provider task mappings and callback receipts live in `PROVIDER_SQLITE_PATH` (default `.runtime/provider-state.sqlite` outside tests).
- Real-dispatch spend reservations live in `vouch_spend_reservations` on the **runtime** database. `SpendCeiling` creates that table at process start; it is not part of `sqlite-migrations.ts`.
- Artifact inspection and reset operate against `RUNTIME_ARTIFACT_ROOT`.
- Queue claim recovery uses the `local_queue_claims` table and `SQLiteLocalQueueStore`.
- Existing services (`job`, `artifact`, `privacy`, `self-verification`, `consensus`, `adjudication`, `verdict`, `feedback`) now write through `src/adapters/storage/sqlite-repositories.ts`.

## Startup Contract

- `src/config/runtime.ts` resolves local runtime paths and queue TTL.
- `src/config/runtime-validation.ts` fails startup if the database path or artifact root is not writable.
- `src/api/app.ts` validates runtime paths before Fastify accepts traffic and closes the SQLite store on shutdown.

## Operator Inspection

- `GET /health` without `x-health-challenge` returns local runtime mode and
  database path, and requires `x-operator-token` when
  `RUNTIME_OPERATOR_TOKEN` is set (401 otherwise). With `x-health-challenge`,
  the handler returns a `health_proof` HMAC instead of the database path so a
  managed supervisor can authenticate the process without leaking inspection
  data. See [`privacy-gate.md`](privacy-gate.md#health-proof).
- `GET /runtime/inspection` returns the active runtime paths.
- `GET /runtime/inspection/jobs/:jobId` returns the persisted job, verdict, feedback, consensus, adjudication, and ledger state used for restart validation.
- Inspection routes are **503** in production when `RUNTIME_OPERATOR_TOKEN` is unset.
