# Tasks: Verification Control Plane

**Input**: Design documents from `/specs/001-verification-control-plane/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Required by constitution and plan for contracts, privacy gate, escalation policy, consensus/adjudication rules, adapter mapping, feedback signals, and ledger transitions.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize the TypeScript service, test tooling, and source tree from the implementation plan.

- [X] T001 Create project directories in src/api, src/domain, src/adapters, src/workers, src/config, tests/contract, tests/integration, and tests/unit
- [X] T002 Initialize Node.js TypeScript project metadata and scripts in package.json
- [X] T003 [P] Configure TypeScript compiler options in tsconfig.json
- [X] T004 [P] Configure linting and formatting in eslint.config.js and prettier.config.js
- [X] T005 [P] Configure test runner and coverage defaults in vitest.config.ts
- [X] T006 Add runtime configuration schema and environment loading in src/config/runtime.ts
- [X] T007 Add local service bootstrap entrypoint in src/api/server.ts
- [X] T008 Add worker bootstrap entrypoint in src/workers/index.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core contracts, persistence abstractions, ledger, and policy foundations that all user stories depend on.

**Critical**: No user story work can begin until this phase is complete.

- [X] T009 [P] Add OpenAPI contract validation test for specs/001-verification-control-plane/contracts/openapi.yaml in tests/contract/openapi-contract.test.ts
- [X] T010 [P] Add event contract uniqueness and payload safety test for specs/001-verification-control-plane/contracts/events.md in tests/contract/event-contract.test.ts
- [X] T011 [P] Define shared domain scalar types and enums in src/domain/shared/types.ts
- [X] T012 [P] Define VerificationJob and AcceptanceCriterion models in src/domain/jobs/models.ts
- [X] T013 [P] Define ArtifactManifest and artifact reference models in src/domain/artifacts/models.ts
- [X] T014 [P] Define PrivacyClassification and reviewer route models in src/domain/privacy/models.ts
- [X] T015 [P] Define SelfVerificationResult models in src/domain/self-verification/models.ts
- [X] T016 [P] Define HumanReviewTask, HumanResponse, ReviewerPool, and ProviderCapabilityProfile models in src/domain/human-review/models.ts
- [X] T017 [P] Define ConsensusResult and AdjudicationCase models in src/domain/consensus/models.ts
- [X] T018 [P] Define FinalVerdict, AgentFeedbackSignal, and VerdictLedgerEvent models in src/domain/feedback/models.ts
- [X] T019 Create PostgreSQL persistence interface definitions in src/adapters/storage/repositories.ts
- [X] T020 Create S3-compatible artifact storage interface in src/adapters/storage/artifact-store.ts
- [X] T021 Create pg-boss queue adapter interface and job names in src/adapters/queue/queue.ts
- [X] T022 Create Pino and OpenTelemetry observability adapter interfaces in src/adapters/observability/observability.ts
- [X] T023 Implement append-only verdict ledger service in src/domain/ledger/ledger-service.ts
- [X] T024 Add ledger state-transition unit tests in tests/unit/ledger-service.test.ts
- [X] T025 Implement budget policy model and cap evaluator in src/domain/jobs/budget-policy.ts
- [X] T026 Add budget cap unit tests in tests/unit/budget-policy.test.ts

**Checkpoint**: Foundation ready; user story implementation can now begin in priority order or in parallel by separate contributors.

---

## Phase 3: User Story 1 - Verify Agent Work Before Release (Priority: P1) MVP

**Goal**: Accept an agent verification job with evidence, classify evidence, run self-verification, produce a pass/fail/retry/recapture/fail-closed verdict, record the ledger, and return agent feedback.

**Independent Test**: Submit a completed agent task with acceptance criteria and evidence, then confirm final verdict includes criterion outcomes, confidence, severity, evidence references, retry guidance, and ledger traceability.

### Tests for User Story 1

- [X] T027 [P] [US1] Add job intake contract tests for POST /verification-jobs in tests/contract/job-intake-contract.test.ts
- [X] T028 [P] [US1] Add artifact manifest contract tests for POST /verification-jobs/{jobId}/artifacts in tests/contract/artifact-contract.test.ts
- [X] T029 [P] [US1] Add self-verification contract tests for POST /verification-jobs/{jobId}/self-verification-results in tests/contract/self-verification-contract.test.ts
- [X] T030 [P] [US1] Add final verdict and feedback contract tests in tests/contract/verdict-feedback-contract.test.ts
- [X] T031 [P] [US1] Add job lifecycle integration test for high-confidence pass in tests/integration/us1-job-pass.test.ts
- [X] T032 [P] [US1] Add retry and artifact recapture integration test in tests/integration/us1-retry-recapture.test.ts
- [X] T033 [P] [US1] Add fail-closed privacy integration test in tests/integration/us1-fail-closed.test.ts

### Implementation for User Story 1

- [X] T034 [US1] Implement idempotent verification job service in src/domain/jobs/job-service.ts
- [X] T035 [US1] Implement acceptance criteria validation in src/domain/jobs/acceptance-criteria-service.ts
- [X] T036 [US1] Implement artifact manifest attachment and quality validation in src/domain/artifacts/artifact-service.ts
- [X] T037 [US1] Implement privacy classification and fail-closed policy gate in src/domain/privacy/privacy-gate.ts
- [X] T038 [US1] Implement self-verification result ingestion and decision policy in src/domain/self-verification/self-verification-service.ts
- [X] T039 [US1] Implement verdict finalization service in src/domain/feedback/verdict-service.ts
- [X] T040 [US1] Implement agent feedback signal builder in src/domain/feedback/feedback-service.ts
- [X] T041 [US1] Implement job intake and status routes in src/api/routes/verification-jobs.ts
- [X] T042 [US1] Implement artifact and self-verification routes in src/api/routes/evidence.ts
- [X] T043 [US1] Implement verdict and feedback routes in src/api/routes/verdict-feedback.ts
- [X] T044 [US1] Implement self-verification worker orchestration in src/workers/self-verification-worker.ts
- [X] T045 [US1] Wire US1 services, repositories, queues, and observability in src/api/app.ts

**Checkpoint**: User Story 1 is independently functional as the MVP release-gating verification loop.

---

## Phase 4: User Story 2 - Escalate Uncertain Cases to Human Review (Priority: P2)

**Goal**: Route uncertain safe cases to sanitized human review, ingest structured reviewer responses, apply reliability-weighted consensus, preserve severe minority reports, and adjudicate disputed or high-risk outcomes.

**Independent Test**: Submit a medium-confidence visual verification case safe for external review, collect multiple structured responses, and confirm consensus or adjudication produces the final outcome without exposing raw artifacts.

### Tests for User Story 2

- [X] T046 [P] [US2] Add human review task contract tests for POST /verification-jobs/{jobId}/human-review-tasks in tests/contract/human-review-task-contract.test.ts
- [X] T047 [P] [US2] Add human response ingestion contract tests for POST /human-review-tasks/{reviewTaskId}/responses in tests/contract/human-response-contract.test.ts
- [X] T048 [P] [US2] Add consensus contract tests for POST /verification-jobs/{jobId}/consensus in tests/contract/consensus-contract.test.ts
- [X] T049 [P] [US2] Add adjudication contract tests for POST /verification-jobs/{jobId}/adjudications in tests/contract/adjudication-contract.test.ts
- [X] T050 [P] [US2] Add safe external review integration test in tests/integration/us2-human-review-consensus.test.ts
- [X] T051 [P] [US2] Add severe minority adjudication integration test in tests/integration/us2-severe-minority-adjudication.test.ts
- [X] T052 [P] [US2] Add artifact-insufficient human response integration test in tests/integration/us2-artifact-insufficient.test.ts

### Implementation for User Story 2

- [X] T053 [US2] Implement sanitized human review task builder in src/domain/human-review/human-review-task-service.ts
- [X] T054 [US2] Implement reviewer response validation and quality filtering in src/domain/human-review/response-validation-service.ts
- [X] T055 [US2] Implement provider capability registry in src/domain/human-review/provider-capability-registry.ts
- [X] T056 [US2] Implement internal reviewer provider adapter in src/adapters/providers/internal-reviewer-adapter.ts
- [X] T057 [US2] Implement low-risk public provider adapter contract shell in src/adapters/providers/public-provider-adapter.ts
- [X] T058 [US2] Implement reliability-weighted consensus service in src/domain/consensus/consensus-service.ts
- [X] T059 [US2] Implement adjudication trigger and decision service in src/domain/adjudication/adjudication-service.ts
- [X] T060 [US2] Implement human review task, response, consensus, and adjudication routes in src/api/routes/human-review.ts
- [X] T061 [US2] Implement escalation worker in src/workers/escalation-worker.ts
- [X] T062 [US2] Implement provider response ingestion worker in src/workers/provider-ingestion-worker.ts
- [X] T063 [US2] Implement adjudication worker in src/workers/adjudication-worker.ts
- [X] T064 [US2] Wire US2 services into final verdict and feedback flow in src/domain/feedback/verdict-service.ts

**Checkpoint**: User Story 2 is independently testable for safe human escalation and adjudicated outcomes.

---

## Phase 5: User Story 3 - Control Privacy, Cost, and Provider Quality (Priority: P3)

**Goal**: Give platform administrators enforceable controls for externalization, reviewer eligibility, provider routing, budgets, retention, auditability, metrics, and calibration loops.

**Independent Test**: Configure risk, privacy, budget, and provider policies for several jobs, then confirm routing, spend, retention, and audit records match policy.

### Tests for User Story 3

- [X] T065 [P] [US3] Add externalization policy matrix tests in tests/unit/externalization-policy.test.ts
- [X] T066 [P] [US3] Add provider routing and fallback tests in tests/unit/provider-routing-policy.test.ts
- [X] T067 [P] [US3] Add retention policy tests in tests/unit/retention-policy.test.ts
- [X] T068 [P] [US3] Add observability metrics integration test in tests/integration/us3-observability.test.ts
- [X] T069 [P] [US3] Add budget blocked event integration test in tests/integration/us3-budget-blocked.test.ts
- [X] T070 [P] [US3] Add calibration outcome integration test in tests/integration/us3-calibration-loop.test.ts

### Implementation for User Story 3

- [X] T071 [US3] Implement externalization policy matrix in src/domain/privacy/externalization-policy.ts
- [X] T072 [US3] Implement provider routing and fallback policy in src/domain/human-review/provider-routing-policy.ts
- [X] T073 [US3] Implement reviewer eligibility and quality policy service in src/domain/human-review/reviewer-quality-service.ts
- [X] T074 [US3] Implement retention policy service in src/domain/ledger/retention-policy.ts
- [X] T075 [US3] Implement budget blocked and fail-closed ledger events in src/domain/ledger/ledger-service.ts
- [X] T076 [US3] Implement metrics emitters for jobs, privacy, providers, consensus, costs, and drift in src/adapters/observability/metrics.ts
- [X] T077 [US3] Implement calibration service for self-versus-human outcomes in src/domain/feedback/calibration-service.ts
- [X] T078 [US3] Implement provider health and cost reporting service in src/domain/human-review/provider-operations-service.ts
- [X] T079 [US3] Wire admin policy configuration loading in src/config/policies.ts
- [X] T080 [US3] Document operational policy examples in docs/ops/verification-control-plane-policies.md

**Checkpoint**: User Story 3 is independently testable for governed routing, spending, audit, retention, and calibration.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Hardening and documentation that cut across all user stories.

- [X] T081 [P] Update README.md with local setup, service commands, and contract validation commands
- [X] T082 [P] Add architecture overview in docs/architecture/verification-control-plane.md
- [X] T083 [P] Add threat model and privacy externalization checklist in docs/security/privacy-gate-threat-model.md
- [X] T084 Add end-to-end quickstart validation scenario in tests/integration/quickstart-e2e.test.ts
- [X] T085 Add CI workflow for lint, tests, OpenAPI validation, and markdown link checks in .github/workflows/ci.yml
- [X] T086 Run quickstart validation and record evidence in docs/ops/verification-control-plane-validation.md

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; starts immediately.
- **Foundational (Phase 2)**: Depends on Setup; blocks all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational; recommended MVP.
- **User Story 2 (Phase 4)**: Depends on Foundational and integrates with US1 verdict/feedback services for final outcomes.
- **User Story 3 (Phase 5)**: Depends on Foundational and can run alongside US1/US2 after shared policy interfaces exist.
- **Polish (Phase 6)**: Depends on the user stories selected for delivery.

### User Story Dependencies

- **US1**: No dependency on US2 or US3; delivers the core verification loop.
- **US2**: Uses US1 job, artifact, privacy, verdict, and feedback foundations; independently testable with internal/public provider adapters.
- **US3**: Uses shared privacy, provider, budget, ledger, and observability foundations; independently testable through policy scenarios.

### Within Each User Story

- Write contract, unit, and integration tests before implementation.
- Models before services.
- Services before API routes.
- API routes before workers that call them indirectly.
- Workers before end-to-end integration validation.
- Ledger and feedback behavior must be verified before marking a story complete.

---

## Parallel Opportunities

- Setup tasks T003, T004, and T005 can run in parallel after T002.
- Foundational model tasks T011 through T018 can run in parallel.
- Foundational adapter interfaces T019 through T022 can run in parallel after model shapes are agreed.
- US1 contract tests T027 through T030 can run in parallel; US1 integration tests T031 through T033 can run in parallel after test helpers exist.
- US2 contract tests T046 through T049 can run in parallel; US2 integration tests T050 through T052 can run in parallel after human review test fixtures exist.
- US3 tests T065 through T070 can run in parallel because they target separate policy and observability concerns.
- Documentation polish tasks T081 through T083 can run in parallel.

## Parallel Example: User Story 1

```bash
Task: "T027 [P] [US1] Add job intake contract tests for POST /verification-jobs in tests/contract/job-intake-contract.test.ts"
Task: "T028 [P] [US1] Add artifact manifest contract tests for POST /verification-jobs/{jobId}/artifacts in tests/contract/artifact-contract.test.ts"
Task: "T029 [P] [US1] Add self-verification contract tests for POST /verification-jobs/{jobId}/self-verification-results in tests/contract/self-verification-contract.test.ts"
Task: "T030 [P] [US1] Add final verdict and feedback contract tests in tests/contract/verdict-feedback-contract.test.ts"
```

## Parallel Example: User Story 2

```bash
Task: "T046 [P] [US2] Add human review task contract tests for POST /verification-jobs/{jobId}/human-review-tasks in tests/contract/human-review-task-contract.test.ts"
Task: "T047 [P] [US2] Add human response ingestion contract tests for POST /human-review-tasks/{reviewTaskId}/responses in tests/contract/human-response-contract.test.ts"
Task: "T048 [P] [US2] Add consensus contract tests for POST /verification-jobs/{jobId}/consensus in tests/contract/consensus-contract.test.ts"
Task: "T049 [P] [US2] Add adjudication contract tests for POST /verification-jobs/{jobId}/adjudications in tests/contract/adjudication-contract.test.ts"
```

## Parallel Example: User Story 3

```bash
Task: "T065 [P] [US3] Add externalization policy matrix tests in tests/unit/externalization-policy.test.ts"
Task: "T066 [P] [US3] Add provider routing and fallback tests in tests/unit/provider-routing-policy.test.ts"
Task: "T067 [P] [US3] Add retention policy tests in tests/unit/retention-policy.test.ts"
Task: "T068 [P] [US3] Add observability metrics integration test in tests/integration/us3-observability.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 setup.
2. Complete Phase 2 foundational contracts, models, ledger, budget, and adapters.
3. Complete Phase 3 User Story 1.
4. Validate job intake, evidence attachment, privacy fail-closed, self-verification decision, final verdict, feedback signal, and ledger traceability.
5. Stop before public provider dispatch.

### Incremental Delivery

1. Deliver US1 for the core release-gating verification loop.
2. Add US2 for safe human escalation, consensus, and adjudication.
3. Add US3 for administrative governance, provider health, cost controls, retention, observability, and calibration.
4. Run quickstart validation after each increment.

### Parallel Team Strategy

1. Team completes Setup and Foundational phases together.
2. After Foundational phase, one contributor owns US1, one contributor owns US2 provider and consensus work, and one contributor owns US3 policy and observability work.
3. All contributors use the same domain contracts and ledger events to avoid provider-specific drift.

## Task Summary

- Total tasks: 86
- Setup: 8 tasks
- Foundational: 18 tasks
- US1: 19 tasks
- US2: 19 tasks
- US3: 16 tasks
- Polish: 6 tasks
- Suggested MVP scope: Phase 1, Phase 2, and Phase 3 only
