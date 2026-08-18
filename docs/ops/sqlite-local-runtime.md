# SQLite Local Runtime Operations

## Environment

- `RUNTIME_SQLITE_PATH`: SQLite database path. Defaults to `.runtime/local-runtime.sqlite` outside tests.
- `PROVIDER_SQLITE_PATH`: provider mapping/receipt DB. Defaults to `.runtime/provider-state.sqlite` outside tests. Unset in Vitest so those tests use in-memory mapping.
- `RUNTIME_ARTIFACT_ROOT`: local artifact directory. Defaults to `.runtime/artifacts`.
- `RUNTIME_QUEUE_CLAIM_TTL_SECONDS`: queue-claim recovery threshold. Defaults to `300`.
- `LOCAL_PROVIDER_MODE`: `simulated` by default.
- `RUNTIME_OPERATOR_TOKEN`: required in production (`NODE_ENV=production` fails startup without it). Guards inspection and the full `/health` payload.
- `VOUCH_REAL_SPEND_CEILING_USD`: optional cumulative real-dispatch cap. See [`spend-ceiling.md`](spend-ceiling.md).

## Start

```bash
npm run dev
```

The app validates the runtime paths before accepting requests.

## Validate

```bash
npm run lint
npm run build
npm test
npm run validate:local-runtime
```

`validate:local-runtime` runs a local create -> artifact -> privacy -> self-verification -> inspection flow against a temporary SQLite database.

## Inspect

When `RUNTIME_OPERATOR_TOKEN` is set, send it. Bare curls against a tokenized
broker return 401:

```bash
curl -H "x-operator-token: $RUNTIME_OPERATOR_TOKEN" \
  http://localhost:3000/runtime/inspection
curl -H "x-operator-token: $RUNTIME_OPERATOR_TOKEN" \
  http://localhost:3000/runtime/inspection/jobs/<job-id>
```

`GET /health` with a token returns `database_path` and provider mode. The same
path with `x-health-challenge` (and no token) returns only a `health_proof`
HMAC — that is the Pi supervisor probe, not an inspection document.

## Reset

- Stop the API **and** the dispatch worker first. Deleting a live WAL corrupts
  the runtime DB.
- Remove **both** SQLite files and the artifact tree. Resetting only
  `local-runtime.sqlite` leaves provider mappings and does not clear spend
  reservations if you point `RUNTIME_SQLITE_PATH` elsewhere but forget the
  default provider DB.
- Restart the service to recreate them.

Example:

```bash
rm -rf .runtime/local-runtime.sqlite .runtime/local-runtime.sqlite-wal \
  .runtime/local-runtime.sqlite-shm \
  .runtime/provider-state.sqlite .runtime/provider-state.sqlite-wal \
  .runtime/provider-state.sqlite-shm \
  .runtime/artifacts
```

Spend reservations live in the runtime DB (`vouch_spend_reservations`). Wiping
that file resets the cumulative ceiling ledger.

## Pitfalls

- Node 24+ is required (`node:sqlite`).
- Production without `RUNTIME_OPERATOR_TOKEN` refuses to boot.
- Two databases: jobs/privacy/spend vs provider mappings. Reset both.
- Do not commit `.runtime/` or `~/.vouch/pi`.
