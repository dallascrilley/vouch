# Deployment

The broker ships as a single container image built from the repository
`Dockerfile`. It compiles TypeScript to JavaScript in a builder stage and runs
the compiled output with production-only dependencies as a non-root user.

## Image

```bash
docker build -t ai-human-review-broker:latest .
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
  ai-human-review-broker:latest
```

- `GET /health` is unauthenticated and used by the container `HEALTHCHECK`.
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
  ai-human-review-broker:latest dist/workers/index.js
```

It shares the same `/data` volume as the API server. It also handles
`SIGTERM`/`SIGINT` for clean shutdown, retries failed claims, and dead-letters a
claim (state `failed`) after `MAX_CLAIM_ATTEMPTS` (5) so a poison message cannot
loop forever.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP listen port |
| `NODE_ENV` | `production` (image) | Runtime environment |
| `RUNTIME_SQLITE_PATH` | `/data/local-runtime.sqlite` | Structured state DB |
| `PROVIDER_SQLITE_PATH` | `/data/provider-state.sqlite` | Provider state DB |
| `RUNTIME_ARTIFACT_ROOT` | `/data/artifacts` | Artifact + inspection tree |
| `RUNTIME_QUEUE_CLAIM_TTL_SECONDS` | `300` | Queue claim visibility timeout |
| `LOG_LEVEL` | `info` | Pino log level |
| `RUNTIME_OPERATOR_TOKEN` | _(unset)_ | Operator token for `/runtime/inspection*` |
| `LOCAL_PROVIDER_MODE` | `simulated` | `simulated` or `disabled` |

### Security-relevant configuration

- **`RUNTIME_OPERATOR_TOKEN`** — the `/runtime/inspection` and
  `/runtime/inspection/jobs/:jobId` endpoints expose internal state (ledger,
  privacy classifications, verdicts). When this token is set, requests must send
  a matching `x-operator-token` header. When it is **not** set, the endpoints are
  **refused with `503` in production** (and only open in non-production for local
  dev). Always set it in production.
- **`PROVIDER_SHARED_SECRET`** — when set, `/provider-callback` requires a
  matching secret (timing-safe comparison). Omitting it on a request no longer
  bypasses the check.

## Provider integration

To enable the real provider path, set `PROVIDER_ENABLED=true`,
`PROVIDER_ID`, `PROVIDER_API_KEY`, `PROVIDER_DISPATCH_URL`,
`PROVIDER_CALLBACK_BASE_URL`, and `PROVIDER_SHARED_SECRET`. Validate provider
configuration before rollout with `npm run validate:provider`. See
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
