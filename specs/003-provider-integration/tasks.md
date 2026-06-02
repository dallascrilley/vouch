# Tasks: Provider Integration

**Input**: Design documents from `/specs/003-provider-integration/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Include tests for provider dispatch, privacy-gate enforcement, response ingestion, consensus/adjudication behavior, fallback behavior, local secret handling, and machine-readable feedback preservation.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (`US1`, `US2`, `US3`)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare the provider-integration branch for adapter, secret, and validation work.

- [X] T001 Review and align local runtime/provider config surfaces in src/config/runtime.ts and src/config/policies.ts
- [X] T002 Extend package metadata and local scripts for provider validation in package.json
- [X] T003 [P] Add provider-related ignore guidance for local runtime artifacts in README.md
- [X] T004 [P] Add local secret/config example placeholders in docs/ops/verification-control-plane-policies.md

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Add the shared provider configuration, persistence, health, and mapping foundation before any provider story work begins.

**Critical**: No user story work can begin until this phase is complete.

- [X] T005 [P] Add provider adapter configuration model support in src/domain/human-review/models.ts
- [X] T006 [P] Add provider task mapping and provider response receipt persistence interfaces in src/adapters/storage/repositories.ts
- [X] T007 [P] Add local provider config loading defaults in src/config/policies.ts
- [X] T008 [P] Add provider health tracking primitives in src/domain/human-review/provider-operations-service.ts
- [X] T009 Implement SQLite-backed provider mapping persistence contract in specs/003-provider-integration/contracts/adapter.md alignment tests under tests/contract/
- [X] T010 Implement local secret-handling validation helpers in src/config/provider-config.ts
- [X] T011 Extend app composition for pluggable real-provider enablement in src/api/app.ts

**Checkpoint**: Foundation ready; real provider work can now begin by user story.

---

## Phase 3: User Story 1 - Dispatch Real Human Review Through One Provider (Priority: P1) MVP

**Goal**: Route eligible review tasks through one real provider, persist provider task mappings, ingest provider responses, and preserve the existing consensus/verdict loop.

**Independent Test**: Configure local provider credentials, dispatch a real provider task, ingest a real or simulated provider delivery through the adapter path, and confirm consensus/verdict flow stays intact.

### Tests for User Story 1

- [X] T012 [P] [US1] Add provider dispatch contract tests in tests/contract/provider-dispatch-contract.test.ts
- [X] T013 [P] [US1] Add provider response normalization contract tests in tests/contract/provider-response-contract.test.ts
- [X] T014 [P] [US1] Add provider mapping persistence tests in tests/contract/provider-mapping-contract.test.ts
- [X] T015 [P] [US1] Add real-provider dispatch integration test in tests/integration/provider-dispatch-flow.test.ts
- [X] T016 [P] [US1] Add provider response ingestion integration test in tests/integration/provider-response-flow.test.ts

### Implementation for User Story 1

- [X] T017 [US1] Implement real provider adapter configuration service in src/domain/human-review/provider-config-service.ts
- [X] T018 [US1] Implement provider task mapping service in src/domain/human-review/provider-task-mapping-service.ts
- [X] T019 [US1] Implement real provider dispatch adapter in src/adapters/providers/real-provider-adapter.ts
- [X] T020 [US1] Implement provider response receipt normalization service in src/domain/human-review/provider-response-service.ts
- [X] T021 [US1] Implement provider dispatch route or route extension in src/api/routes/human-review.ts
- [X] T022 [US1] Implement provider callback or retrieval ingestion route in src/api/routes/provider-callback.ts
- [X] T023 [US1] Implement provider dispatch worker handling in src/workers/provider-dispatch-worker.ts
- [X] T024 [US1] Wire real provider adapter and mapping persistence into src/api/app.ts

**Checkpoint**: A real provider can create a task and return a normalized response without breaking the current verdict loop.

---

## Phase 4: User Story 2 - Manage Real Provider Credentials and Local Operations Safely (Priority: P2)

**Goal**: Provide safe local credential handling, startup validation, and local-only operational proof for the real provider integration.

**Independent Test**: Run the documented local startup and validation path with valid and invalid provider configuration, confirm explicit outcomes, and verify no secret values leak into logs or docs.

### Tests for User Story 2

- [X] T025 [P] [US2] Add provider config validation tests in tests/unit/provider-config-validation.test.ts
- [X] T026 [P] [US2] Add invalid-credential integration test in tests/integration/provider-invalid-credentials.test.ts
- [X] T027 [P] [US2] Add secret-redaction/log-safety test in tests/integration/provider-secret-safety.test.ts
- [X] T028 [P] [US2] Add local validation workflow test in tests/integration/provider-local-validation.test.ts

### Implementation for User Story 2

- [X] T029 [US2] Implement local provider config validator in src/config/provider-config.ts
- [X] T030 [US2] Implement startup guard for provider enablement in src/api/app.ts
- [X] T031 [US2] Implement secret-safe logging helpers in src/adapters/observability/provider-log-redaction.ts
- [X] T032 [US2] Document local provider setup and troubleshooting in docs/ops/provider-integration-local-setup.md
- [X] T033 [US2] Document local validation steps and expected evidence in docs/ops/provider-integration-validation.md

**Checkpoint**: Local provider setup and validation are safe, explicit, and independent of GitHub Actions.

---

## Phase 5: User Story 3 - Preserve Verification Semantics Across Real Provider Integration (Priority: P3)

**Goal**: Keep privacy-gate, fallback, consensus/adjudication, and machine-readable feedback semantics unchanged when real provider responses are introduced.

**Independent Test**: Run regression scenarios for blocked externalization, provider outage, disagreement, and feedback output while using the real adapter path and confirm externally visible semantics remain stable.

### Tests for User Story 3

- [X] T034 [P] [US3] Add privacy-blocked provider dispatch regression test in tests/integration/provider-privacy-blocked.test.ts
- [X] T035 [P] [US3] Add provider degradation fallback test in tests/integration/provider-fallback.test.ts
- [X] T036 [P] [US3] Add provider disagreement/adjudication regression test in tests/integration/provider-disagreement-regression.test.ts
- [X] T037 [P] [US3] Add feedback semantics regression test in tests/contract/provider-feedback-regression.test.ts

### Implementation for User Story 3

- [X] T038 [US3] Implement provider fallback policy in src/domain/human-review/provider-routing-policy.ts
- [X] T039 [US3] Extend privacy gate to deny real dispatch on blocked routes in src/domain/privacy/privacy-gate.ts
- [X] T040 [US3] Extend consensus and adjudication handling for real provider receipts in src/domain/consensus/consensus-service.ts and src/domain/adjudication/adjudication-service.ts
- [X] T041 [US3] Extend feedback generation for provider-originated responses in src/domain/feedback/feedback-service.ts
- [X] T042 [US3] Add provider health and fallback operational reporting in src/domain/human-review/provider-operations-service.ts

**Checkpoint**: Real provider integration preserves the same external privacy, verdict, and feedback guarantees as the existing runtime.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final documentation, cleanup, and validation across the provider integration feature.

- [X] T043 [P] Update README.md with real provider setup and local-only validation commands
- [X] T044 [P] Add provider integration architecture notes in docs/architecture/provider-integration.md
- [X] T045 [P] Add provider secret-handling threat notes in docs/security/provider-secret-handling.md
- [X] T046 Add end-to-end provider quickstart validation in tests/integration/provider-quickstart-e2e.test.ts
- [X] T047 Add or update local workflow validation script references in docs/ops/provider-integration-validation.md
- [X] T048 Run quickstart.md validation and record evidence in docs/ops/provider-integration-proof.md

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Starts immediately.
- **Foundational (Phase 2)**: Depends on setup and blocks all provider story work.
- **User Story 1 (Phase 3)**: Depends on foundational provider configuration and mapping support.
- **User Story 2 (Phase 4)**: Depends on foundational support and uses the real adapter path from US1.
- **User Story 3 (Phase 5)**: Depends on US1 adapter behavior and optionally US2 local validation surfaces.
- **Polish (Phase 6)**: Depends on all desired user stories being complete.

### User Story Dependencies

- **US1**: Primary MVP for this feature.
- **US2**: Builds on US1 by making the real adapter usable and safe locally.
- **US3**: Builds on US1 and US2 to ensure semantics and fallback behavior remain intact.

### Within Each User Story

- Tests first
- Configuration and mapping before dispatch
- Dispatch before ingestion
- Ingestion before consensus/adjudication regression
- Semantics verification before marking the story complete

## Parallel Opportunities

- Setup tasks `T003` and `T004` can run in parallel.
- Foundational tasks `T005` through `T008` can run in parallel.
- US1 tests `T012` through `T016` can run in parallel.
- US2 tests `T025` through `T028` can run in parallel.
- US3 regression tests `T034` through `T037` can run in parallel.
- Polish docs tasks `T043` through `T045` can run in parallel.

## Parallel Example: User Story 1

```bash
Task: "T012 [P] [US1] Add provider dispatch contract tests in tests/contract/provider-dispatch-contract.test.ts"
Task: "T013 [P] [US1] Add provider response normalization contract tests in tests/contract/provider-response-contract.test.ts"
Task: "T014 [P] [US1] Add provider mapping persistence tests in tests/contract/provider-mapping-contract.test.ts"
Task: "T015 [P] [US1] Add real-provider dispatch integration test in tests/integration/provider-dispatch-flow.test.ts"
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete setup and foundational provider support.
2. Implement the first real provider adapter and response-ingestion path.
3. Validate provider-neutral consensus and verdict behavior.

### Incremental Delivery

1. Ship US1 to prove the real provider can participate in the workflow.
2. Add US2 to harden local secret handling and local-only operations.
3. Add US3 to preserve fallback and semantic guarantees.

### Parallel Team Strategy

1. One contributor owns adapter/config wiring.
2. One contributor owns provider tests and local validation docs.
3. One contributor owns regression/fallback behavior once the adapter path exists.

## Task Summary

- Total tasks: 48
- Setup: 4 tasks
- Foundational: 7 tasks
- US1: 13 tasks
- US2: 9 tasks
- US3: 9 tasks
- Polish: 6 tasks
- Suggested MVP scope: Phase 1, Phase 2, and Phase 3 only
