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
