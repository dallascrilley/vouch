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

npm test && npm run lint

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

`script/cibuild` runs `npm ci`, `build:js`, and `npm run verify` (broker gate). Existing
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
