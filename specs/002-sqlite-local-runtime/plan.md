# Implementation Plan: SQLite Local Runtime

**Branch**: `002-sqlite-local-runtime` | **Date**: 2026-05-31 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-sqlite-local-runtime/spec.md`

## Current Implementation Status (2026-06)

Shipped: SQLite runtime on Node.js 24+ with in-memory metrics (`InMemoryMetricsRecorder`).
OpenTelemetry export is a production-target gap — see `docs/architecture/runtime-target.md`.

## Summary

Replace the current in-memory verification runtime with a durable local runtime centered on SQLite, while preserving the existing route contracts and verification semantics. The implementation will introduce SQLite-backed repositories, a local queue state model, local provider simulation paths, startup/config validation, and local-only operational validation so the full verification loop can survive restart and run without GitHub Actions or hosted infrastructure.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js LTS  
**Primary Dependencies**: Fastify, Ajv JSON Schema validation, OpenAPI 3.1 contracts, SQLite driver, structured local migration support, local queue coordination on SQLite, Pino structured logging, OpenTelemetry metrics/tracing  
**Storage**: SQLite for jobs, acceptance criteria, artifacts metadata, privacy classifications, review tasks, responses, consensus, adjudications, verdicts, feedback, budgets, and ledger events; local filesystem for artifact blobs and validation evidence  
**Testing**: Vitest unit, contract, and integration tests; local restart validation tests; contract validation and quickstart proof run executed locally  
**Target Platform**: Single-machine local service and worker runtime on a prepared development machine  
**Project Type**: Web service / background worker control plane with local-only operating mode  
**Performance Goals**: Persist and recover local verification state across restart without semantic drift; complete local validation workflow in under 10 minutes on a prepared machine; maintain existing contract/integration pass rate after persistence upgrade  
**Constraints**: SQLite is mandatory for this feature; no GitHub Actions dependency in the intended operating or validation path; privacy gate, verdict semantics, and provider-neutral contracts must remain externally stable; local-only provider simulation must exercise review, consensus, and adjudication paths without hosted services  
**Scale/Scope**: One-machine deployable runtime, local queue processing, local provider simulation, durable restart behavior, documented local validation, and no cloud dependencies in the feature slice

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Evidence contract**: PASS. Plan will preserve job identity, criteria, manifests, artifact hashes, provenance, ledger events, and self-verification result shape while moving to SQLite-backed storage.
- **Privacy gate**: PASS. Plan keeps privacy classification and fail-closed behavior as first-class persisted decisions and restricts local provider simulation using the same policy boundaries.
- **Provider neutrality**: PASS. Local provider simulation is an adapter choice, not a core-model change; provider-neutral jobs, tasks, responses, and verdicts remain intact.
- **Consensus/adjudication**: PASS. Local persistence will store normalized responses, consensus outputs, disagreement state, and adjudication decisions without changing the contract semantics.
- **Feedback and ledger**: PASS. Machine-readable feedback, ledger transitions, budget controls, and observability remain part of the durable local runtime design.

## Project Structure

### Documentation (this feature)

```text
specs/002-sqlite-local-runtime/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── runtime.md
│   └── local-operations.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── adapters/
│   ├── observability/
│   ├── providers/
│   ├── queue/
│   └── storage/
├── api/
│   └── routes/
├── config/
├── domain/
│   ├── adjudication/
│   ├── artifacts/
│   ├── consensus/
│   ├── feedback/
│   ├── human-review/
│   ├── jobs/
│   ├── ledger/
│   ├── privacy/
│   └── self-verification/
└── workers/

tests/
├── contract/
├── integration/
└── unit/

docs/
├── architecture/
├── ops/
└── security/
```

**Structure Decision**: Keep the existing single-project service layout. This feature changes runtime internals and operator surfaces, not the top-level codebase split.

## Complexity Tracking

No constitution violations are required for this plan.

## Phase 0: Research

Research decisions are captured in [research.md](./research.md). All technical context items are resolved with no remaining `NEEDS CLARIFICATION` markers.

## Phase 1: Design and Contracts

Design artifacts:

- [data-model.md](./data-model.md): durable local runtime entities, queue state, and configuration records
- [contracts/runtime.md](./contracts/runtime.md): local runtime persistence, queue, and restart contract
- [contracts/local-operations.md](./contracts/local-operations.md): local-only startup, validation, and reset contract
- [quickstart.md](./quickstart.md): local startup, restart, and validation sequence for SQLite-backed operation

## Post-Design Constitution Check

- **Evidence contract**: PASS. Durable entities explicitly preserve job identity, artifact manifest references, persisted verdicts, feedback signals, and ledger event continuity across restart.
- **Privacy gate**: PASS. The design keeps privacy classification durable, fail-closed outcomes persistent, and local provider simulation constrained by the same policy decisions.
- **Provider neutrality**: PASS. Runtime and operations contracts keep provider simulation behind adapter boundaries and do not add provider-specific semantics to core records.
- **Consensus/adjudication**: PASS. The design persists normalized responses, consensus state, adjudication cases, and severity/disagreement data without collapsing the existing decision layers.
- **Feedback and ledger**: PASS. Durable storage, local queue processing, budget-blocked behavior, and local observability preserve the contract required by the constitution.
