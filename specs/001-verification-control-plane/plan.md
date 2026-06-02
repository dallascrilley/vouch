# Implementation Plan: Verification Control Plane

**Branch**: `001-verification-control-plane` | **Date**: 2026-05-31 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-verification-control-plane/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Build a provider-neutral verification control plane that accepts agent evidence, classifies and sanitizes artifacts, runs self-verification, escalates uncertain safe cases to human review, normalizes responses, applies consensus/adjudication, records an immutable verdict ledger, and returns machine-readable feedback to agents and release gates. The implementation approach is contract-first: define stable domain models and external interfaces before provider adapters, build privacy and self-verification before public dispatch, and keep MTurk/Prolific/managed/internal reviewer details behind capability adapters.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js LTS  
**Primary Dependencies**: Fastify, Ajv JSON Schema validation, OpenAPI 3.1 contracts, PostgreSQL client, pg-boss queue, S3-compatible object storage client, Pino structured logging, OpenTelemetry metrics/tracing  
**Storage**: PostgreSQL for jobs, policy decisions, responses, consensus, ledger events, budgets, and reviewer metadata; S3-compatible object storage for raw artifacts and sanitized human packages  
**Testing**: Unit tests for policies and model transitions; contract tests for OpenAPI and event schemas; integration tests for job lifecycle, privacy fail-closed behavior, consensus/adjudication, and feedback signals  
**Target Platform**: Server-side service plus asynchronous workers in a controlled staging/synthetic environment first  
**Project Type**: Web service / background worker control plane  
**Performance Goals**: 95% of complete-evidence jobs receive a terminal or routed decision within the configured deadline; operators can trace a verdict within 5 minutes; paid review dispatch never exceeds configured caps  
**Constraints**: Deny-by-default externalization; public external review only for approved low-risk sanitized packages; provider-neutral core models; all release-gating severe defect reports adjudicated or blocked by policy; no raw secrets/customer data in public review packages  
**Scale/Scope**: MVP supports one public low-risk provider adapter, one internal reviewer path, three-worker quorum for eligible low-risk tasks, manual adjudication fallback, hard job/run/project/provider/daily budget caps, and staging/synthetic evidence only

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Evidence contract**: PASS. Plan and contracts define stable job identity, acceptance criteria, artifact manifests, hashes/provenance, environment metadata, self-verification results, and artifact sufficiency states.
- **Privacy gate**: PASS. Plan routes all artifacts through privacy classification, redaction, externalization policy, approved reviewer route selection, and fail-closed outcomes before external dispatch.
- **Provider neutrality**: PASS. Core models use provider-neutral jobs, tasks, assignments, reviewer pools, responses, consensus, verdicts, and adapter capability profiles; provider-specific IDs remain adapter metadata.
- **Consensus/adjudication**: PASS. Data model defines quorum, reviewer reliability inputs, response validation, disagreement handling, artifact-insufficient handling, severity preservation, and adjudication triggers.
- **Feedback and ledger**: PASS. Contracts define final verdicts, feedback signals, ledger events, observability metrics, cost controls, retry limits, and release-gate behavior.

## Project Structure

### Documentation (this feature)

```text
specs/001-verification-control-plane/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── openapi.yaml
│   └── events.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── api/
│   ├── routes/
│   └── serializers/
├── domain/
│   ├── jobs/
│   ├── artifacts/
│   ├── privacy/
│   ├── self-verification/
│   ├── human-review/
│   ├── consensus/
│   ├── adjudication/
│   ├── feedback/
│   └── ledger/
├── adapters/
│   ├── providers/
│   ├── storage/
│   ├── queue/
│   └── observability/
├── workers/
│   ├── self-verification-worker.ts
│   ├── escalation-worker.ts
│   ├── provider-ingestion-worker.ts
│   └── adjudication-worker.ts
└── config/

tests/
├── contract/
├── integration/
└── unit/
```

**Structure Decision**: Use one service codebase with modular domain packages and worker entrypoints. This keeps the control plane, policy decisions, and ledger model coherent while isolating provider, storage, queue, and observability implementations behind adapters.

## Complexity Tracking

No constitution violations are required for the planned design.

## Phase 0: Research

Research decisions are captured in [research.md](./research.md). All technical context choices have been resolved with no remaining `NEEDS CLARIFICATION` markers.

## Phase 1: Design and Contracts

Design artifacts:

- [data-model.md](./data-model.md): core entities, validation rules, relationships, and lifecycle transitions
- [contracts/openapi.yaml](./contracts/openapi.yaml): synchronous control-plane API contract
- [contracts/events.md](./contracts/events.md): asynchronous event and feedback signal contract
- [quickstart.md](./quickstart.md): implementation and validation path for the planned MVP

## Post-Design Constitution Check

- **Evidence contract**: PASS. `VerificationJob`, `ArtifactManifest`, `AcceptanceCriterion`, and `SelfVerificationResult` are modeled with required identity, provenance, hashes, environment metadata, evidence mapping, and sufficiency status.
- **Privacy gate**: PASS. `PrivacyClassification` and the OpenAPI routes require classification before external package creation; contracts include blocked/fail-closed outcomes and approved reviewer routes.
- **Provider neutrality**: PASS. Provider capability and task contracts use neutral reviewer pools, assignments, and responses. Provider-specific mappings are isolated to adapter metadata and cannot drive final verdict semantics.
- **Consensus/adjudication**: PASS. `ConsensusResult` and `AdjudicationCase` preserve severity, disagreement, artifact sufficiency, reviewer reliability, quorum state, and adjudication triggers.
- **Feedback and ledger**: PASS. `FinalVerdict`, `AgentFeedbackSignal`, and ledger events expose machine-readable outcomes, evidence pointers, policy constraints, budget state, latency/cost, and release-gate effects.
