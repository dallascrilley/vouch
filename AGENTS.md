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
