# Tasks: SQLite Local Runtime

**Input**: Design documents from `/specs/002-sqlite-local-runtime/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Required by the plan for SQLite durability, local queue recovery, startup validation, provider simulation, and local-only operations proof.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Introduce local runtime configuration, SQLite dependency wiring, and operator entrypoints for the durable runtime.

- [X] T001 Add SQLite runtime dependency and local validation scripts in package.json
- [X] T002 [P] Add SQLite runtime configuration defaults in src/config/runtime.ts
- [ ] T003 [P] Add local runtime policy defaults and resettable paths in src/config/policies.ts
- [X] T004 [P] Add SQLite migration bootstrap entrypoint in src/adapters/storage/sqlite-migrations.ts
- [X] T005 Add local runtime wiring placeholders in src/api/app.ts
- [X] T006 Add local runtime validation script entrypoint in scripts/validate-local-runtime.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Define durable runtime models, repository contracts, queue coordination, and SQLite storage foundations used by every story.

**Critical**: No user story work can begin until this phase is complete.

- [X] T007 [P] Extend repository interfaces for durable lookups and atomic writes in src/adapters/storage/repositories.ts
- [X] T008 [P] Add runtime store and queue claim models in src/domain/jobs/runtime-store.ts
- [X] T009 [P] Add local queue coordination interfaces and job names in src/adapters/queue/local-queue.ts
- [X] T010 [P] Add SQLite row serialization helpers in src/adapters/storage/sqlite-codecs.ts
- [X] T011 Implement SQLite schema creation and migration runner in src/adapters/storage/sqlite-migrations.ts
- [X] T012 Implement SQLite repository bundle for jobs, criteria, artifacts, privacy, responses, verdicts, and ledger in src/adapters/storage/sqlite-repositories.ts
- [X] T013 Implement SQLite-backed queue claim store in src/adapters/queue/sqlite-queue.ts
- [X] T014 Implement local artifact path resolver and inspection helpers in src/adapters/storage/local-artifact-store.ts
- [X] T015 Implement startup validation for database, artifact root, and runtime version in src/config/runtime-validation.ts
- [X] T016 Add foundational SQLite repository tests in tests/unit/sqlite-repositories.test.ts
- [X] T017 Add startup validation tests for invalid runtime paths in tests/unit/runtime-validation.test.ts

**Checkpoint**: Durable runtime foundation is in place; user story work can proceed with SQLite-backed state and local queue coordination.

---

## Phase 3: User Story 1 - Run Durable Verification Locally (Priority: P1) MVP

**Goal**: Persist the verification loop locally so jobs, artifacts, privacy decisions, verdicts, feedback, and ledger history survive restart without semantic drift.

**Independent Test**: Create and advance jobs, restart the service, and confirm the same job state, verdict, feedback, and ledger entries remain retrievable.

### Tests for User Story 1

- [X] T018 [P] [US1] Add SQLite durability regression tests for job, artifact, and verdict persistence in tests/integration/us1-sqlite-durability.test.ts
- [ ] T019 [P] [US1] Add append-only ledger persistence tests in tests/integration/us1-ledger-restart.test.ts
- [ ] T020 [P] [US1] Add atomic write failure tests for partial transition rollback in tests/integration/us1-atomic-persistence.test.ts
- [ ] T021 [P] [US1] Add route contract regression tests against SQLite-backed storage in tests/contract/us1-runtime-contract.test.ts

### Implementation for User Story 1

- [X] T022 [US1] Persist verification job creation and acceptance criteria in src/domain/jobs/job-service.ts
- [X] T023 [US1] Persist artifact manifests and local artifact references in src/domain/artifacts/artifact-service.ts
- [X] T024 [US1] Persist privacy classification and fail-closed state in src/domain/privacy/privacy-gate.ts
- [X] T025 [US1] Persist self-verification outputs and verdict finalization in src/domain/self-verification/self-verification-service.ts
- [X] T026 [US1] Persist final verdict and feedback records in src/domain/feedback/verdict-service.ts
- [X] T027 [US1] Persist ledger transitions and replay support in src/domain/ledger/ledger-service.ts
- [X] T028 [US1] Wire SQLite repositories and migration startup into src/api/app.ts
- [X] T029 [US1] Update service bootstrap for local runtime readiness in src/api/server.ts

**Checkpoint**: User Story 1 is independently functional with restart-safe durable verification state.

---

## Phase 4: User Story 2 - Operate the Full Review Loop Without Cloud Dependencies (Priority: P2)

**Goal**: Run local queue processing, internal review, and provider simulation entirely on one machine with no hosted queue or marketplace dependency.

**Independent Test**: Run the documented quickstart locally, including worker processing and provider simulation, and confirm the full verification loop completes without cloud services.

### Tests for User Story 2

- [ ] T030 [P] [US2] Add local queue claim recovery tests in tests/integration/us2-queue-recovery.test.ts
- [ ] T031 [P] [US2] Add local provider simulation flow tests in tests/integration/us2-provider-simulation.test.ts
- [X] T032 [P] [US2] Add local-only validation command tests in tests/integration/us2-local-validation.test.ts
- [ ] T033 [P] [US2] Add startup failure integration tests for locked or unwritable runtime paths in tests/integration/us2-startup-failure.test.ts

### Implementation for User Story 2

- [ ] T034 [US2] Implement SQLite-backed queue claim and release logic in src/adapters/queue/sqlite-queue.ts
- [X] T035 [US2] Implement local provider simulation adapter in src/adapters/providers/local-provider-simulator.ts
- [X] T036 [US2] Implement durable task dispatch orchestration for local workers in src/workers/provider-dispatch-worker.ts
- [X] T037 [US2] Implement queue resume and recoverable in-flight task handling in src/workers/index.ts
- [ ] T038 [US2] Update human review task routing to use local provider simulation in src/api/routes/human-review.ts
- [X] T039 [US2] Add runtime inspection and safe reset routes or commands in src/api/routes/runtime-operations.ts
- [X] T040 [US2] Wire local validation and inspection commands into src/api/app.ts

**Checkpoint**: User Story 2 is independently testable as a local-only verification runtime with worker, queue, and provider simulation.

---

## Phase 5: User Story 3 - Preserve Verification Semantics During the Runtime Upgrade (Priority: P3)

**Goal**: Keep existing route contracts, privacy behavior, budgets, consensus, adjudication, and feedback semantics stable while moving the runtime to SQLite and local-only operations.

**Independent Test**: Re-run the existing contract and integration scenarios on the SQLite runtime and confirm externally visible outcomes are unchanged.

### Tests for User Story 3

- [ ] T041 [P] [US3] Add regression tests for privacy-gated blocked review behavior in tests/integration/us3-privacy-regression.test.ts
- [ ] T042 [P] [US3] Add regression tests for budget-blocked and retry semantics in tests/integration/us3-budget-regression.test.ts
- [ ] T043 [P] [US3] Add regression tests for consensus and adjudication outcomes on durable state in tests/integration/us3-consensus-regression.test.ts
- [ ] T044 [P] [US3] Add feedback and verdict shape regression tests in tests/contract/us3-feedback-regression.test.ts

### Implementation for User Story 3

- [ ] T045 [US3] Preserve budget and blocked-state semantics in src/domain/jobs/budget-policy.ts
- [ ] T046 [US3] Preserve consensus durability and replay behavior in src/domain/consensus/consensus-service.ts
- [ ] T047 [US3] Preserve adjudication durability and restart-safe decision loading in src/domain/adjudication/adjudication-service.ts
- [ ] T048 [US3] Preserve feedback signal semantics after durable persistence in src/domain/feedback/feedback-service.ts
- [ ] T049 [US3] Preserve route contract behavior while switching repository implementations in src/api/routes/verification-jobs.ts
- [ ] T050 [US3] Preserve verdict, feedback, and human-review route semantics in src/api/routes/verdict-feedback.ts and src/api/routes/human-review.ts

**Checkpoint**: User Story 3 proves the runtime migration preserved external semantics and governance behavior.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Finish operator documentation, validation proof, and branch-level cleanup for the SQLite local runtime.

- [X] T051 [P] Document SQLite runtime architecture in docs/architecture/sqlite-local-runtime.md
- [X] T052 [P] Document local startup, validation, inspection, and reset procedures in docs/ops/sqlite-local-runtime.md
- [X] T053 [P] Document local runtime storage and privacy handling in docs/security/local-runtime-data-handling.md
- [ ] T054 Add quickstart end-to-end local runtime validation in tests/integration/sqlite-runtime-quickstart.test.ts
- [X] T055 Run local validation and record proof in docs/ops/sqlite-local-runtime-validation.md
- [X] T056 Mark completed work in specs/002-sqlite-local-runtime/tasks.md

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; starts immediately.
- **Foundational (Phase 2)**: Depends on Setup; blocks all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational; recommended MVP.
- **User Story 2 (Phase 4)**: Depends on Foundational and the durable repository wiring from US1.
- **User Story 3 (Phase 5)**: Depends on Foundational and uses the SQLite-backed runtime from US1 and US2.
- **Polish (Phase 6)**: Depends on the user stories selected for delivery.

### User Story Dependencies

- **US1**: No dependency on US2 or US3; delivers the durable local verification loop.
- **US2**: Uses US1 persistence and worker wiring; independently testable for local-only queue and provider simulation.
- **US3**: Uses the durable runtime from US1 and US2 to prove contract and semantic stability.

### Within Each User Story

- Write regression and integration tests before implementation.
- Repository and queue primitives before route or worker wiring.
- Services before API routes.
- Runtime wiring before quickstart validation.
- Validation proof before marking the feature complete.

---

## Parallel Opportunities

- Setup tasks T002 through T004 can run in parallel after T001.
- Foundational contract and model tasks T007 through T010 can run in parallel.
- Foundational validation tests T016 and T017 can run in parallel after the repository shapes are defined.
- US1 regression tests T018 through T021 can run in parallel.
- US2 local runtime tests T030 through T033 can run in parallel.
- US3 regression tests T041 through T044 can run in parallel.
- Documentation tasks T051 through T053 can run in parallel.

## Parallel Example: User Story 1

```bash
Task: "T018 [P] [US1] Add SQLite durability regression tests for job, artifact, and verdict persistence in tests/integration/us1-sqlite-durability.test.ts"
Task: "T019 [P] [US1] Add append-only ledger persistence tests in tests/integration/us1-ledger-restart.test.ts"
Task: "T020 [P] [US1] Add atomic write failure tests for partial transition rollback in tests/integration/us1-atomic-persistence.test.ts"
Task: "T021 [P] [US1] Add route contract regression tests against SQLite-backed storage in tests/contract/us1-runtime-contract.test.ts"
```

## Parallel Example: User Story 2

```bash
Task: "T030 [P] [US2] Add local queue claim recovery tests in tests/integration/us2-queue-recovery.test.ts"
Task: "T031 [P] [US2] Add local provider simulation flow tests in tests/integration/us2-provider-simulation.test.ts"
Task: "T032 [P] [US2] Add local-only validation command tests in tests/integration/us2-local-validation.test.ts"
Task: "T033 [P] [US2] Add startup failure integration tests for locked or unwritable runtime paths in tests/integration/us2-startup-failure.test.ts"
```

## Parallel Example: User Story 3

```bash
Task: "T041 [P] [US3] Add regression tests for privacy-gated blocked review behavior in tests/integration/us3-privacy-regression.test.ts"
Task: "T042 [P] [US3] Add regression tests for budget-blocked and retry semantics in tests/integration/us3-budget-regression.test.ts"
Task: "T043 [P] [US3] Add regression tests for consensus and adjudication outcomes on durable state in tests/integration/us3-consensus-regression.test.ts"
Task: "T044 [P] [US3] Add feedback and verdict shape regression tests in tests/contract/us3-feedback-regression.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 setup.
2. Complete Phase 2 foundational SQLite runtime work.
3. Complete Phase 3 User Story 1.
4. Validate restart durability, atomic writes, verdict persistence, and ledger replay.
5. Stop before local provider simulation if only MVP is needed.

### Incremental Delivery

1. Deliver US1 for durable local verification state.
2. Add US2 for local-only queue processing and provider simulation.
3. Add US3 for semantic regression coverage across privacy, budgets, consensus, adjudication, and feedback.
4. Run quickstart validation and record operator proof.

### Parallel Team Strategy

1. One contributor can build SQLite repositories and startup validation while another prepares regression tests.
2. After US1 wiring lands, queue/provider simulation work in US2 can proceed in parallel with US3 regression coverage.
3. Documentation and final proof can run in parallel with the last regression fixes.
