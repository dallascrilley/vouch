# Project Context — ai-human-review-broker

Durable facts an agent needs that are NOT obvious from the code. Keep current.

## What it is

Contract-first verification control plane: job intake, privacy gating, self-verification,
human review orchestration (MTurk/Bux/simulated), consensus, adjudication, verdict
ledgering, and machine-readable agent feedback. Agents commission reviews via
`npm run review`; the repo dogfoods its own broker through `npm run verify`.

## Stack & architecture

- **Stack:** TypeScript 5.x, Node.js 24+, Fastify, Ajv, OpenAPI 3.1, Pino, Vitest, ESLint + Prettier
- **Runtime (today):** SQLite (`node:sqlite`), `SQLiteLocalQueueStore`, filesystem artifact store — see `docs/architecture/runtime-target.md`
- **Production target (not in `src/` yet):** PostgreSQL, pg-boss, S3-compatible storage, OpenTelemetry
- **Entrypoints:** `src/api/server.ts` (HTTP), `src/workers/index.ts` (dispatch worker), `scripts/request-review.ts` (agent CLI)
- **Domain modules:** `src/domain/{jobs,artifacts,privacy,self-verification,human-review,consensus,adjudication,feedback,ledger}`
- **Contracts:** `specs/001-verification-control-plane/contracts/openapi.yaml`

## Environments

| Env | Where | Notes |
|-----|-------|-------|
| local | `npm run dev` / `just server` | API on default port; SQLite under `RUNTIME_SQLITE_PATH` |
| local worker | `npm run dev:worker` | Provider dispatch worker |
| ci | `.github/workflows/ci.yml` | `npm ci`, `build:js`, `npm run verify` (broker gate) |
| docker | `Dockerfile` | Node 24 image; state under `/data` |
| mturk sandbox | Bux + `docs/ops/` runbooks | Staging seeds and bridge scripts |

## Key decisions

- SQLite-first local runtime until production adapters land (`docs/architecture/runtime-target.md`)
- Contract-first API: OpenAPI is source of truth for HTTP surface
- `npm run verify` routes lint + typecheck + tests through the broker as release gate
- Provider-neutral human review: simulated local mode, MTurk bridge, real provider adapter
- ADRs: `docs/decisions/` (bootstrap scaffold); link load-bearing decisions there

## Known constraints & gotchas

- Do not assume PostgreSQL, pg-boss, S3, or OTel without checking `src/`
- `scripts/` holds app-specific tooling; `script/` is bootstrap canonical entrypoints (`just` aliases)
- Keep `.env*`, provider secrets, and proof logs out of the repo
- Sim worker and provider bridge timing: see `docs/solutions/runtime/`

## External services & secrets

| Service | Purpose | Config |
|---------|---------|--------|
| MTurk / Bux | Human review tasks | Provider env vars; see `docs/ops/mturk-*.md` |
| Deployed broker | Remote verify gate | `BROKER_URL` for `npm run verify` |
| Runtime operator | Inspection endpoints | `RUNTIME_OPERATOR_TOKEN` |
| Provider callbacks | HIT response ingestion | `PROVIDER_SHARED_SECRET` |
