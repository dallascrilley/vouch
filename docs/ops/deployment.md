# Deployment

The broker ships as a single container image built from the repository
`Dockerfile`. It compiles TypeScript to JavaScript in a builder stage and runs
the compiled output with production-only dependencies as a non-root user.

## Image

```bash
docker build -t vouch:latest .
```

The image is based on `node:24-bookworm-slim`. Node 24 is required because the
local runtime uses the built-in `node:sqlite` module, which is available without
an experimental flag on the Node 24 line.

## Running the API server

```bash
docker run -d --name broker \
  -p 3000:3000 \
  -v broker-data:/data \
  -e RUNTIME_OPERATOR_TOKEN="$(openssl rand -hex 32)" \
  vouch:latest
```

- `GET /health` has two modes. With `x-operator-token`, it returns runtime
  mode and `database_path` (the container `HEALTHCHECK` uses this). With
  `x-health-challenge` and no token, it returns a `health_proof` HMAC and does
  **not** include the database path. Unauthenticated `/health` without a
  challenge is `401` when the token is configured. Production refuses to boot
  if `RUNTIME_OPERATOR_TOKEN` is unset.
- The SQLite databases and artifact tree live under `/data` (declared as a
  volume) so state survives container restarts.
- The process handles `SIGTERM`/`SIGINT` and closes the HTTP server and SQLite
  stores cleanly, so `docker stop` / orchestrator rollouts do not corrupt the
  WAL or drop in-flight requests.

## Running the dispatch worker

The simulated-provider dispatch worker is a separate long-lived process that
polls the queue:

```bash
docker run -d --name broker-worker \
  -v broker-data:/data \
  --entrypoint node \
  vouch:latest dist/workers/index.js
```

It shares the same `/data` volume as the API server. It also handles
`SIGTERM`/`SIGINT` for clean shutdown, retries failed claims, and dead-letters a
claim (state `failed`) after `MAX_CLAIM_ATTEMPTS` (5) so a poison message cannot
loop forever.

## Configuration

| Variable                          | Default                       | Purpose                                |
| --------------------------------- | ----------------------------- | -------------------------------------- |
| `PORT`                            | `3000`                        | HTTP listen port                       |
| `NODE_ENV`                        | `production` (image)          | Runtime environment                    |
| `RUNTIME_SQLITE_PATH`             | `/data/local-runtime.sqlite`  | Structured state DB                    |
| `PROVIDER_SQLITE_PATH`            | `/data/provider-state.sqlite` | Provider state DB                      |
| `RUNTIME_ARTIFACT_ROOT`           | `/data/artifacts`             | Artifact + inspection tree             |
| `RUNTIME_QUEUE_CLAIM_TTL_SECONDS` | `300`                         | Queue claim visibility timeout         |
| `LOG_LEVEL`                       | `info`                        | Pino log level                         |
| `RUNTIME_OPERATOR_TOKEN`          | _(unset)_                     | Operator token; required in production |
| `LOCAL_PROVIDER_MODE`             | `simulated`                   | `simulated` or `disabled`              |
| `VOUCH_REAL_SPEND_CEILING_USD`    | _(unset)_                     | Cumulative real-dispatch cap (USD)     |

### Security-relevant configuration

- **`RUNTIME_OPERATOR_TOKEN`** — `/runtime/inspection*` and the full `/health`
  document expose internal state (ledger, privacy classifications, verdicts,
  `database_path`). When this token is set, those requests must send a matching
  `x-operator-token` header. When it is **not** set, inspection is **refused
  with `503` in production** (and only open in non-production for local
  dev). `NODE_ENV=production` fails startup without the token. Always set it
  in production. The Pi supervisor uses the same secret to verify
  `health_proof`.
- **`PROVIDER_SHARED_SECRET`** — required for the callback ingestion path;
  `/provider-callback` requires a matching secret (timing-safe comparison).
  Omitting it from configuration or a request fails closed. The on-request
  operator-token gate exempts `/provider-callback` and `/health` so callbacks
  authenticate with this secret instead.
- **`VOUCH_REAL_SPEND_CEILING_USD`** — hard cumulative cap on real-provider
  dispatch. Unset means no reservation ledger. See
  [`spend-ceiling.md`](spend-ceiling.md).

## Provider integration

To enable the real provider path, set `PROVIDER_ENABLED=true`,
`PROVIDER_ID`, `PROVIDER_API_KEY`, `PROVIDER_DISPATCH_URL`,
`PROVIDER_CALLBACK_BASE_URL`, and `PROVIDER_SHARED_SECRET`. Agent jobs that
request a non-internal pool also need `LOCAL_PROVIDER_MODE=disabled` (the Pi
`/vouch-go-live` ceremony writes both). Validate provider configuration before
rollout with `npm run validate:provider`. See
`docs/ops/provider-integration-local-setup.md` for details.

## Pre-deploy verification

```bash
npm run lint
npm run build
npm test
npm run build:js   # emits dist/ used by the image
```

### Container smoke (local)

Proves `docker build` → API `/health` → worker dispatch → `agent_next_action: pass`
without using the host Node toolchain for the runtime:

```bash
script/validate-docker-smoke
```

Expect exit `0` and JSON ending with `"status":"docker smoke passed"`. Requires
Docker daemon; not run in CI by default.
