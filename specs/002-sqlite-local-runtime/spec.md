# Feature Specification: SQLite Local Runtime

**Feature Branch**: `002-sqlite-local-runtime`  
**Created**: 2026-05-31  
**Status**: Draft  
**Input**: User description: "Implement deployable persistence, queue, and provider runtime using SQLite and local-only operations, replacing in-memory repositories and removing GitHub Actions dependency from the operational path."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Run Durable Verification Locally (Priority: P1)

As an operator or developer, I need the verification control plane to persist jobs, evidence metadata, review tasks, responses, consensus, adjudications, verdicts, and feedback in a local durable runtime so that I can stop and restart the service without losing active verification state.

**Why this priority**: The current prototype proves the workflow but loses all state on restart. Durable local runtime is the first step that makes the system usable beyond a single process.

**Independent Test**: Start the service, create and advance verification jobs through multiple states, restart the service, and confirm the previously recorded jobs, ledger events, verdicts, and feedback remain available.

**Acceptance Scenarios**:

1. **Given** a verification job has been created and progressed through evidence, privacy, and verdict steps, **When** the service restarts, **Then** the job state, ledger history, verdict, and feedback are still retrievable.
2. **Given** multiple verification jobs and review tasks are active, **When** the local runtime is queried after a restart, **Then** each job retains its correct independent state and associated records.
3. **Given** a persistence error occurs during a state transition, **When** the transition is attempted, **Then** the system fails the operation clearly and does not leave partially written records behind.

---

### User Story 2 - Operate the Full Review Loop Without Cloud Dependencies (Priority: P2)

As an operator, I need the service, queue processing, provider simulation, documentation, and validation workflow to run entirely on my machine without GitHub Actions or hosted infrastructure so that the system can be exercised, debugged, and demonstrated locally.

**Why this priority**: Local-only operation removes external setup friction and matches the requested near-term deployment mode.

**Independent Test**: Install dependencies, run the service and local queue processing, execute the documented validation workflow, and confirm the entire verification loop completes using only local tools and files.

**Acceptance Scenarios**:

1. **Given** the local runtime is started with its documented commands, **When** an operator executes the quickstart flow, **Then** the full verification loop completes using only local processes and local storage.
2. **Given** provider integrations are not connected to external marketplaces, **When** human review steps are exercised, **Then** local internal-review and local provider-simulation paths provide enough behavior to test routing, responses, consensus, and adjudication.
3. **Given** the operator follows the documented validation steps on a machine without GitHub Actions access, **When** the validation commands run, **Then** all required checks complete locally and produce clear pass or fail evidence.

---

### User Story 3 - Preserve Verification Semantics During the Runtime Upgrade (Priority: P3)

As a maintainer, I need the shift from in-memory runtime to SQLite-backed local runtime to preserve the existing verification semantics and contract behavior so that prior flows, tests, and operator expectations still hold after the storage change.

**Why this priority**: Persistence changes can silently alter lifecycle behavior, routing, or verdict semantics if not constrained explicitly.

**Independent Test**: Run the existing contract and integration scenarios against the upgraded runtime and confirm the same externally visible job, verdict, feedback, and human-review behaviors remain intact.

**Acceptance Scenarios**:

1. **Given** the same job-intake, evidence, privacy, self-verification, human-review, consensus, and adjudication inputs are used before and after the runtime upgrade, **When** the flows complete, **Then** the externally visible outcomes remain equivalent.
2. **Given** the runtime is switched from purely in-memory behavior to SQLite-backed durability, **When** tests and operator scenarios run, **Then** no user-facing contract fields, route meanings, or verdict semantics regress.
3. **Given** local persistence or queue configuration is invalid, **When** the service starts, **Then** it reports a clear startup failure rather than running in a misleading partial mode.

### Edge Cases

- A local database file is missing, locked, corrupted, or points to an unexpected location.
- A queued task is recorded before a process stop and must resume or fail cleanly after restart.
- The local provider-simulation path returns conflicting or malformed responses.
- A local run exceeds configured budget caps and must emit the same blocked behavior as the prototype.
- The machine has no network access at all and the operator still needs to run validation.
- Local files or directories required for persistence are not writable.
- The runtime is started twice against the same local database and queue storage.
- Existing in-memory assumptions in tests mask missing persistence guarantees.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST store verification jobs, acceptance criteria, artifact manifests, privacy classifications, self-verification results, human review tasks, human responses, consensus results, adjudication records, final verdicts, feedback signals, and ledger events in a durable local runtime.
- **FR-002**: The durable local runtime MUST remain usable after process restart without requiring external services.
- **FR-003**: The system MUST use SQLite as the authoritative local persistence mechanism for structured verification records.
- **FR-004**: The system MUST provide a local queue-processing path that works without hosted queue infrastructure.
- **FR-005**: The system MUST keep the externally visible route contracts, verdict meanings, and feedback semantics compatible with the current verification workflow.
- **FR-006**: The system MUST preserve append-only ledger behavior when storing and replaying state transitions locally.
- **FR-007**: The system MUST reject invalid or partial state transitions in the same cases as the current implementation, even when persistence is durable.
- **FR-008**: The system MUST detect and report local persistence initialization failures before accepting verification work.
- **FR-009**: The system MUST ensure that a failed persistence operation does not leave a verification job in a partially updated externally visible state.
- **FR-010**: The system MUST support local-only internal-review and local provider-simulation behavior sufficient to exercise review-task routing, response ingestion, consensus, and adjudication flows.
- **FR-011**: The system MUST provide local-only operator documentation for startup, validation, troubleshooting, and expected local data locations.
- **FR-012**: The system MUST NOT require GitHub Actions or any other hosted CI system to validate the runtime in the intended local operating mode.
- **FR-013**: The system MUST provide a local validation path that proves linting, type checking, tests, contract validation, and quickstart behavior without depending on GitHub Actions.
- **FR-014**: The system MUST keep privacy-gate decisions, blocked-review behavior, and budget controls functionally equivalent after the runtime upgrade.
- **FR-015**: The system MUST keep provider-neutral review models intact even though the first durable runtime uses local review and local provider simulation.
- **FR-016**: The system MUST document how local persistence files, queue state, and runtime evidence can be reset or inspected safely.
- **FR-017**: The system MUST define how existing in-memory test and validation scenarios prove durable behavior rather than merely in-process behavior.
- **FR-018**: The system MUST support deterministic local setup with a small enough dependency surface that a maintainer can bring the runtime up on a development machine without manual cloud configuration.

### Key Entities *(include if feature involves data)*

- **Local Runtime Store**: The SQLite-backed durable state for jobs, review artifacts, routing outcomes, verdicts, feedback, and ledger history.
- **Local Queue State**: The locally managed record of queued and in-flight verification work that survives process restart.
- **Provider Simulation Session**: A locally executed substitute for hosted provider behavior that can create review tasks, accept responses, and feed the consensus path.
- **Runtime Configuration Profile**: The local configuration values that define persistence file locations, queue behavior, budget defaults, validation commands, and provider-simulation mode.

### Verification Evidence & Privacy *(mandatory for verification features)*

- **Observable Criteria**: Jobs, review tasks, verdicts, feedback, and ledger entries remain available and semantically correct before and after restart.
- **Required Evidence**: Local command output, persisted SQLite records, local queue state inspection, quickstart test results, and contract/integration test results.
- **Data Classification**: Local runtime must continue honoring public, internal, sensitive, and regulated evidence classes.
- **Externalization Policy**: Local-only operation should not require public externalization; any simulated provider paths must preserve the same policy boundaries.
- **Reviewer Route**: Local self-verification, local internal review, and local provider simulation are the required routes for this feature.
- **Feedback Signal**: The machine-readable pass, fail, retry, recapture, blocked, and policy-constraint fields must remain externally equivalent after the storage/runtime change.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After a process restart, 100% of locally persisted verification jobs used in validation scenarios remain retrievable with their last committed state, verdict, and feedback.
- **SC-002**: 100% of local validation steps required for this feature complete without GitHub Actions or hosted service dependencies.
- **SC-003**: 100% of existing verification contract and integration scenarios used as regression evidence still pass after the runtime moves to SQLite-backed persistence.
- **SC-004**: Operators can initialize and run the local runtime using the documented commands in under 10 minutes on a prepared development machine.
- **SC-005**: 100% of tested persistence failures or invalid startup configurations produce explicit failure signals rather than silent fallback behavior.
- **SC-006**: 100% of budget-blocked, fail-closed, retry, recapture, and adjudication scenarios retain their expected externally visible outcome after the runtime upgrade.

## Assumptions

- SQLite is acceptable as the first durable local persistence layer even if a different production storage system may be chosen later.
- The immediate objective is a deployable local runtime, not multi-machine distributed deployment.
- Local-only operation replaces GitHub Actions in the validation and operating path for this feature.
- Existing route contracts and verification semantics are intended to remain stable while the runtime beneath them changes.
- Provider simulation for local operation can stand in for hosted marketplace integrations in this phase.
- A prepared development machine can install the project dependencies required to run the local runtime and tests.
