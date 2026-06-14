---
ijfw_version: 1.3.2
ijfw_schema: 1
type: software
primary_type: software
secondary_types: []
confidence: 0.907
detected_at: 2026-06-10T13:52:31.361Z
signals:
  - kind: manifest
    weight: 0.9
    manifests: [package.json]
  - kind: dir_business
    weight: 0.4
    name: ops
  - kind: file_extension_ratio
    weight: 0.7
    domain: software
    ratio: 1
    count: 173
---
# docs-spec-constitution-initial Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-06-09

## Active Technologies
- TypeScript 5.x on Node.js 24+ + Fastify, Ajv JSON Schema validation, OpenAPI 3.1 contracts, Pino structured logging (001-verification-control-plane)
- SQLite via `node:sqlite` for jobs, policy decisions, responses, consensus, ledger events, and local queue claims; filesystem artifact store for raw artifacts and sanitized human packages (001-verification-control-plane, current implementation)

## Project Structure

```text
src/
tests/
```

## Commands

Release gate: `script/cibuild` or `just cibuild` (`npm ci`, `build:js`, `npm run verify`, OpenAPI version check).
Quick checks: `script/test`, `npm run lint`.

Requires Node.js 24+ (`engines` in package.json). With mise: `mise install && mise trust`.

## Code Style

TypeScript 5.x on Node.js 24+: Follow standard conventions

## Runtime Notes

- **Current**: SQLite-first local runtime. See `docs/architecture/runtime-target.md`.
- **Production target** (not yet in `src/`): PostgreSQL, pg-boss, S3-compatible storage, OpenTelemetry.

## Recent Changes
- 2026-06-09: Documented SQLite-first runtime; removed unused production-only dependencies until adapters land.
- 001-verification-control-plane: Contract-first verification control plane with provider-neutral human review orchestration.

<!-- MANUAL ADDITIONS START -->

## Agent bootstrap (see also PROJECT_CONTEXT.md)

Durable env/gotcha context agents need at session start:

| Env | Purpose |
|-----|---------|
| `BROKER_URL` | Remote broker for `npm run verify` |
| `RUNTIME_SQLITE_PATH` | Local SQLite path (default `.runtime/local-runtime.sqlite`) |
| `RUNTIME_OPERATOR_TOKEN` | Operator routes: inspection, stuck-state, release-artifact, metrics |
| `PROVIDER_SHARED_SECRET` | Provider callback auth |
| `RUNTIME_ARTIFACT_ROOT` | Artifact store root |

**Gotchas:** `script/` = bootstrap entrypoints; `scripts/` = app tooling. Run `npm run dev:worker` alongside `npm run dev` for HITL dispatch. OpenAPI: `specs/001-verification-control-plane/contracts/openapi.yaml`.

## Agent capability map

| Goal | Command / API |
|------|----------------|
| One-call human review | `npm run review -- --help` |
| Release gate (dogfood) | `npm run verify` |
| Job status mid-flight | `npm run review -- --status <job_id>` |
| Unified TS client | `scripts/lib/broker-client.ts` |
| MCP primitive tools | `npm run mcp:broker` |
| Feedback loop | `GET /verification-jobs/:jobId/feedback` → `agent_next_action` |

Exit codes for `npm run review`: 0 pass, 1 fail, 2 retry, 3 recapture, 4 escalate, 5 pending/timeout.

Docs: `docs/architecture/agent-loop-integration.md`, `docs/architecture/agent-review-contract.md`.

<!-- MANUAL ADDITIONS END -->

<!-- IJFW-MEMORY-START -->
Project memory at .ijfw/memory/. Call `ijfw_memory_prelude` for full context.
<!-- IJFW-MEMORY-END -->

<!-- IJFW-AGENTS-START -->
No project agents yet. Run `ijfw team` to set them up.
<!-- IJFW-AGENTS-END -->

<!-- PROJECT-BOOTSTRAP-START -->

## Script entrypoints (Scripts to Rule Them All)

Canonical commands — prefer these over raw `npm` when an agent needs a standard task:

| Task | Command | `just` |
|------|---------|--------|
| Install toolchain | `script/bootstrap` | `just bootstrap` |
| Get runnable | `script/setup` | `just setup` |
| Refresh after pull | `script/update` | `just update` |
| Run API locally | `script/server` | `just server` |
| Run tests | `script/test` | `just test` |
| What CI should mirror | `script/cibuild` | `just cibuild` |
| REPL | `script/console` | `just console` |

`script/cibuild` runs `npm ci`, `build:js`, `npm run verify` (broker gate), and the OpenAPI
version check. CI also runs lychee link check (not in `script/cibuild`). Existing
`npm run *` scripts remain valid for app-specific workflows (`review`, MTurk seeds, etc.).

## Recommended agents & skills

Hub references (not vendored). Load with `/library load <id>`.

- **Agents:** `code-reviewer`, `architect`, `tdd-guide`, `e2e-runner`, `doc-updater`
- **Skills:** `prime`, `library`, `handoff`, `git`, `td-task-management`,
  `subagent-driven-development`, `secrets-management`, `prompt-optimizer`, `docs-lifecycle`

### Project-relevant skills

- **`human-review`** — Commission human/simulated review verdicts via `npm run review`; core product loop.
  - **Why this project:** Broker is the human-review gate agents call for visual QA and rubric checks.
  - **Path:** `~/.claude/skills/human-review/SKILL.md`
  - **Load:** `/library load human-review`

- **`verify-before-complete`** — Block done claims until verification evidence exists.
  - **Why this project:** `npm run verify` dogfoods the broker; agents must prove gates before shipping.
  - **Path:** `~/.claude/skills/verify-before-complete/SKILL.md`
  - **Load:** `/library load verify-before-complete`

- **`ce-debug`** — Causal-chain debugging with compound learnings into `docs/solutions/`.
  - **Why this project:** Multi-provider review flows and worker timing need structured root-cause work.
  - **Path:** `~/.claude/skills/ce-debug/SKILL.md`
  - **Load:** `/library load ce-debug`

- **`code-reviewer`** — Tiered review before merge; pairs with broker verify gate.
  - **Why this project:** Contract-first API and provider adapters need pre-merge review discipline.
  - **Path:** `~/.claude/skills/code-reviewer/SKILL.md`
  - **Load:** `/library load code-reviewer`

<!-- PROJECT-BOOTSTRAP-END -->
