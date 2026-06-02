# Feature Specification: Provider Integration

**Feature Branch**: `003-provider-integration`  
**Created**: 2026-05-31  
**Status**: Draft  
**Input**: User description: "Implement the first real provider integration for the verification control plane, replacing local provider simulation with one real provider adapter while preserving provider-neutral contracts, privacy-gate enforcement, consensus/adjudication semantics, local secret handling, and local-only validation without GitHub Actions."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Dispatch Real Human Review Through One Provider (Priority: P1)

As an operator, I need the verification control plane to dispatch eligible review tasks to one real external provider and ingest the resulting human observations so that the system can move beyond pure local simulation while preserving the current review workflow.

**Why this priority**: This is the first step that proves the provider-neutral architecture works against a real integration rather than only against simulated local behavior.

**Independent Test**: Configure local provider credentials, dispatch an eligible human review task through the provider, ingest the response via the supported provider callback or retrieval path, and confirm the task appears in the same consensus and verdict workflow already used locally.

**Acceptance Scenarios**:

1. **Given** a verification job is eligible for external review, **When** the operator routes it through the configured provider, **Then** the provider receives the task and the control plane records the resulting external identifiers and task state.
2. **Given** the provider returns one or more human responses, **When** the runtime ingests them, **Then** the responses are normalized into the existing provider-neutral response model and continue through consensus or adjudication.
3. **Given** the provider cannot accept or complete a task, **When** the failure is detected, **Then** the runtime applies the documented fallback or blocked behavior without changing the external contract semantics.

---

### User Story 2 - Manage Real Provider Credentials and Local Operations Safely (Priority: P2)

As an operator, I need local secret handling, provider configuration, and local operational validation that are safe and explicit so that I can use the real provider on my machine without leaking credentials or depending on GitHub Actions.

**Why this priority**: Real provider integration introduces credential and callback risks that are more important than the transport details themselves.

**Independent Test**: Start the runtime with local provider credentials and local callback configuration, run the documented local validation path, and confirm the provider integration works without exposing secrets in logs, config files, or review artifacts.

**Acceptance Scenarios**:

1. **Given** local provider credentials are configured correctly, **When** the runtime starts, **Then** it validates the provider configuration and enables the adapter without requiring GitHub Actions.
2. **Given** local provider credentials are missing or invalid, **When** the runtime starts or the adapter is used, **Then** the system fails clearly and does not fall back silently to an unsafe mode.
3. **Given** the operator runs the documented local validation path, **When** provider dispatch and response ingestion are exercised, **Then** all required proof remains local and does not require GitHub Actions.

---

### User Story 3 - Preserve Verification Semantics Across Real Provider Integration (Priority: P3)

As a maintainer, I need the new real provider adapter to preserve privacy-gate enforcement, provider-neutral contracts, consensus/adjudication behavior, and machine-readable feedback semantics so that adding the real provider does not break the control plane’s existing guarantees.

**Why this priority**: The project’s core value is consistent verification semantics; a real provider cannot be allowed to redefine them.

**Independent Test**: Run existing and new provider-related contract and integration scenarios against the real-adapter path and confirm the same route contracts, privacy rules, consensus behavior, and verdict semantics still hold.

**Acceptance Scenarios**:

1. **Given** a job is blocked by privacy or route policy, **When** the operator attempts to send it to the real provider, **Then** the provider dispatch is denied and the existing fail-closed or restricted-route behavior remains in force.
2. **Given** a real provider response disagrees with another reviewer or reports a severe issue, **When** consensus and adjudication run, **Then** the same disagreement and severity rules continue to apply.
3. **Given** the real provider adapter is disabled or unhealthy, **When** the runtime handles a reviewable job, **Then** provider-neutral fallback behavior remains available and externally visible semantics do not change.

### Edge Cases

- Provider credentials are missing, expired, revoked, malformed, or point to the wrong account.
- The provider accepts task creation but callback or response retrieval fails.
- The provider webhook or polling path receives duplicate, delayed, or partial responses.
- The provider returns a response shape that is inconsistent with the expected review template.
- A job becomes privacy-blocked after the operator attempts external dispatch.
- The real provider is degraded or unavailable and the runtime must choose fallback behavior.
- The provider-specific identifier mapping is lost or corrupted locally.
- Local validation must prove provider behavior without storing secrets in the repository.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST support one real provider adapter that can create external review tasks and ingest the resulting responses.
- **FR-002**: The real provider adapter MUST remain behind the existing provider-neutral job, task, response, consensus, adjudication, verdict, and feedback models.
- **FR-003**: The system MUST preserve the current externally visible route contracts and verdict semantics while adding the real provider path.
- **FR-004**: The system MUST record the mapping between provider-neutral task identifiers and provider-specific external identifiers.
- **FR-005**: The system MUST support a local credential and provider configuration path that is suitable for development-machine operation.
- **FR-006**: The system MUST validate provider credentials and required local configuration before using the real adapter.
- **FR-007**: The system MUST fail clearly when local provider configuration is invalid, missing, or unusable.
- **FR-008**: The system MUST support one real provider response-ingestion path, whether callback-based or retrieval-based, and normalize the result into the existing response model.
- **FR-009**: The system MUST handle duplicate, delayed, or malformed provider responses without corrupting the verification lifecycle.
- **FR-010**: The system MUST preserve privacy-gate enforcement before any real provider dispatch occurs.
- **FR-011**: The system MUST deny dispatch to the real provider for jobs whose data classification or route policy forbids externalization.
- **FR-012**: The system MUST preserve the current consensus and adjudication rules when responses originate from the real provider.
- **FR-013**: The system MUST preserve machine-readable feedback semantics after real provider responses participate in verdict generation.
- **FR-014**: The system MUST define fallback behavior when the real provider is unavailable, degraded, or rejects the task.
- **FR-015**: The system MUST support local-only validation of the provider integration without relying on GitHub Actions.
- **FR-016**: The system MUST document local provider setup, validation, troubleshooting, and safe secret handling.
- **FR-017**: The system MUST ensure local logs, config examples, validation artifacts, and repository files do not expose provider secrets.
- **FR-018**: The system MUST keep a local-only fallback or simulation path available for cases where real provider dispatch should not occur.

### Key Entities *(include if feature involves data)*

- **Provider Adapter Configuration**: The local configuration and credential references required to activate the real provider adapter safely.
- **Provider Task Mapping**: The persistent link between internal review task IDs and external provider task or assignment IDs.
- **Provider Response Receipt**: The locally stored record of raw provider delivery metadata before normalization into the internal review response model.
- **Provider Health State**: The local view of whether the real provider is healthy, degraded, unavailable, or disabled for dispatch.

### Verification Evidence & Privacy *(mandatory for verification features)*

- **Observable Criteria**: Real provider task creation, response ingestion, consensus flow, adjudication flow, and verdict feedback remain observable through the same local runtime surfaces.
- **Required Evidence**: Local command output, local runtime state, provider task/response mappings, validation logs, and contract/integration test results.
- **Data Classification**: The existing public, internal, sensitive, and regulated evidence classes remain enforced before real provider dispatch.
- **Externalization Policy**: The real provider route is allowed only when the privacy gate and route policy approve it.
- **Reviewer Route**: The feature adds one real provider route while preserving local internal review and local simulation or fallback.
- **Feedback Signal**: Machine-readable pass, fail, retry, recapture, blocked, and policy-constraint outputs remain externally equivalent after real provider responses are introduced.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of validation scenarios that are eligible for the real provider can create an external review task and ingest at least one resulting response locally.
- **SC-002**: 100% of privacy-blocked validation scenarios are denied before real provider dispatch.
- **SC-003**: 100% of local validation steps required for this feature complete without GitHub Actions.
- **SC-004**: 100% of provider-related regression scenarios preserve the existing route contract, verdict semantics, and machine-readable feedback shape.
- **SC-005**: 100% of tested invalid or missing provider credential scenarios fail explicitly without exposing secrets.
- **SC-006**: 100% of tested provider outage or degradation scenarios trigger the documented fallback or blocked behavior.

## Assumptions

- One real provider adapter is sufficient for this feature; additional providers can remain future work.
- Local credential handling can rely on environment-based or secret-reference-based configuration and does not require committing secret values.
- The current route contracts and verification semantics are intended to remain stable during the provider integration.
- Local validation remains the authoritative proof path for this feature.
- The project will continue to preserve a local-only fallback or simulation path alongside the new real provider adapter.
