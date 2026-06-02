# docs-spec-constitution-initial Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-05-31

## Active Technologies
- TypeScript 5.x on Node.js LTS + Fastify, Ajv JSON Schema validation, OpenAPI 3.1 contracts, PostgreSQL client, pg-boss queue, S3-compatible object storage client, Pino structured logging, OpenTelemetry metrics/tracing (001-verification-control-plane)
- PostgreSQL for jobs, policy decisions, responses, consensus, ledger events, budgets, and reviewer metadata; S3-compatible object storage for raw artifacts and sanitized human packages (001-verification-control-plane)

## Project Structure

```text
src/
tests/
```

## Commands

npm test && npm run lint

## Code Style

TypeScript 5.x on Node.js LTS: Follow standard conventions

## Recent Changes
- 001-verification-control-plane: Added TypeScript 5.x on Node.js LTS + Fastify, Ajv JSON Schema validation, OpenAPI 3.1 contracts, PostgreSQL client, pg-boss queue, S3-compatible object storage client, Pino structured logging, OpenTelemetry metrics/tracing

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
