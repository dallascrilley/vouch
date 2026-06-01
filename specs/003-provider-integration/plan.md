# Implementation Plan: Provider Integration

**Branch**: `003-provider-integration` | **Date**: 2026-05-31 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-provider-integration/spec.md`

## Summary

Integrate the first real human-review provider into the verification control plane while preserving the provider-neutral contracts, privacy gate, consensus/adjudication behavior, and machine-readable feedback semantics. The implementation will add one real adapter, local secret/config handling, provider task mapping, response ingestion via callback or retrieval path, provider health/fallback behavior, and local-only validation that proves the real adapter can participate in the existing verification loop without GitHub Actions.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js LTS  
**Primary Dependencies**: Fastify, Ajv JSON Schema validation, OpenAPI 3.1 contracts, SQLite-backed local runtime, provider HTTP client, local secret/config loading, structured webhook or polling support, Pino structured logging, OpenTelemetry metrics/tracing  
**Storage**: Existing local runtime store for jobs, review tasks, responses, consensus, adjudication, verdicts, feedback, and ledger events plus persistent provider task/assignment mapping and provider receipt metadata  
**Testing**: Vitest unit, contract, and integration tests; local validation scripts; local provider-credential/config validation; regression tests for existing verification semantics  
**Target Platform**: Single-machine local service and worker runtime with one real provider enabled through local configuration  
**Project Type**: Web service / background worker control plane with local-only validation path  
**Performance Goals**: Eligible local validation scenarios can create a real provider task and ingest at least one response while preserving existing route and verdict semantics; provider outage or invalid credentials produce explicit fallback or blocked behavior  
**Constraints**: One real provider only for this feature; no GitHub Actions dependency in the validation path; privacy gate and externalization policy remain authoritative before provider dispatch; secrets must stay out of repository files, logs, and validation artifacts; local fallback or simulation path must remain available  
**Scale/Scope**: One real adapter, one local secret/config path, one provider response-ingestion path, provider mapping persistence, fallback behavior, local-only proof, and no broad multi-provider expansion

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Evidence contract**: PASS. Plan will preserve internal job, artifact, response, verdict, feedback, and ledger contracts while adding provider task/assignment mappings and provider receipts.
- **Privacy gate**: PASS. Plan keeps privacy and route checks in front of provider dispatch and requires the same fail-closed behavior for blocked externalization.
- **Provider neutrality**: PASS. Real provider specifics are isolated to adapter configuration, mapping, and ingestion; core review and verdict models remain provider-neutral.
- **Consensus/adjudication**: PASS. The plan preserves normalized response ingestion and the existing disagreement/severity rules after provider responses enter the system.
- **Feedback and ledger**: PASS. Provider events, mapping state, fallback behavior, and final outcomes remain auditable and machine-readable.

## Project Structure

### Documentation (this feature)

```text
specs/003-provider-integration/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── adapter.md
│   └── local-validation.md
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

**Structure Decision**: Keep the existing single-project service layout and add the real provider adapter inside `src/adapters/providers/` plus the supporting domain/config surfaces. This preserves the current module boundaries while swapping one simulation path for a real integration path.

## Complexity Tracking

No constitution violations are required for this plan.

## Phase 0: Research

Research decisions are captured in [research.md](./research.md). All technical context questions are resolved with no remaining `NEEDS CLARIFICATION` markers.

## Phase 1: Design and Contracts

Design artifacts:

- [data-model.md](./data-model.md): provider adapter configuration, provider task mapping, provider response receipt, and health state
- [contracts/adapter.md](./contracts/adapter.md): real provider adapter and ingestion contract
- [contracts/local-validation.md](./contracts/local-validation.md): local secret handling, fallback, and local-only validation contract
- [quickstart.md](./quickstart.md): provider setup, dispatch, ingestion, fallback, and local validation sequence

## Post-Design Constitution Check

- **Evidence contract**: PASS. The design preserves job, verdict, feedback, and ledger contracts while adding explicit provider mapping and receipt records.
- **Privacy gate**: PASS. The design requires privacy and route approval before provider dispatch and preserves blocked externalization semantics.
- **Provider neutrality**: PASS. Real provider behavior is kept inside adapter and mapping contracts rather than leaking into core job/review/verdict semantics.
- **Consensus/adjudication**: PASS. Provider responses enter through the normalized response model and continue through unchanged consensus and adjudication paths.
- **Feedback and ledger**: PASS. Provider dispatch, response ingestion, fallback outcomes, and final verdicts remain machine-readable and auditable.
