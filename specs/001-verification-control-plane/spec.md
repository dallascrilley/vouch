# Feature Specification: Verification Control Plane

**Feature Branch**: `001-verification-control-plane`  
**Created**: 2026-05-31  
**Status**: Draft  
**Input**: User description: "initial.md .specify/memory/constitution.md"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Verify Agent Work Before Release (Priority: P1)

As a release owner, I need a single verification control plane that accepts an agent's claimed work, evaluates the supporting evidence, and returns a clear pass, fail, retry, or blocked verdict so that release decisions do not depend on informal human review.

**Why this priority**: This is the core product value. Without a trusted verdict loop, provider selection, human review, and analytics have no release-gating purpose.

**Independent Test**: Submit a completed agent task with acceptance criteria and evidence, then confirm the system produces a final verdict with criterion-level outcomes, confidence, severity, evidence references, and retry guidance.

**Acceptance Scenarios**:

1. **Given** an agent submits a task with sufficient evidence and all critical checks pass, **When** the verification completes, **Then** the release owner receives a final pass verdict with evidence references and confidence.
2. **Given** an agent submits a task with a critical observable failure, **When** the verification completes, **Then** the release owner receives a fail or retry verdict with failed criteria, severity, and actionable feedback.
3. **Given** submitted evidence is blank, incomplete, still loading, or not tied to acceptance criteria, **When** the verification runs, **Then** the system requests recapture or marks the artifact insufficient instead of passing the task.

---

### User Story 2 - Escalate Uncertain Cases to Human Review (Priority: P2)

As a verification operator, I need uncertain or ambiguous cases to be routed to appropriate human reviewers with sanitized, observable task packages so that human judgment is used only when it adds value and does not expose unnecessary information.

**Why this priority**: Human review is the differentiator for cases that automated checks cannot confidently resolve, but it must be controlled by privacy, cost, latency, and quality policies.

**Independent Test**: Submit a medium-confidence visual verification case that is safe for external review, then confirm the system creates a human review task package, collects multiple structured responses, and produces a consensus result.

**Acceptance Scenarios**:

1. **Given** automated checks disagree or remain uncertain and the evidence is safe for external review, **When** escalation policy runs, **Then** the case is routed to an eligible reviewer pool with a sanitized package and clear observable questions.
2. **Given** evidence contains sensitive or restricted information, **When** escalation policy runs, **Then** public external review is blocked and the case is routed to an approved internal or managed reviewer path, or fails closed if none is available.
3. **Given** reviewers disagree after the initial quorum, **When** consensus runs, **Then** the system adds review capacity or routes to adjudication according to risk, budget, and release policy.

---

### User Story 3 - Control Privacy, Cost, and Provider Quality (Priority: P3)

As a platform administrator, I need governance controls for evidence externalization, reviewer eligibility, provider routing, budget limits, retention, and auditability so that the verification program can scale safely across projects and risk classes.

**Why this priority**: The system can be useful in a small internal setting without full governance, but production use requires explicit safety and operations controls from the start.

**Independent Test**: Configure risk, privacy, budget, and provider policies for several jobs, then confirm routing, spending, retention, and audit records match the configured policy.

**Acceptance Scenarios**:

1. **Given** a job exceeds its per-job, per-run, or daily budget cap, **When** escalation would require more paid review, **Then** the system stops dispatching work and returns the configured blocked or fail-closed outcome.
2. **Given** a provider becomes slow, unavailable, or low quality, **When** jobs are awaiting dispatch, **Then** routing shifts to an eligible fallback or internal queue when policy allows.
3. **Given** a job sends any evidence outside the internal system, **When** the externalization decision is recorded, **Then** the audit record includes evidence hashes, policy version, risk class, redaction outcome, provider class, cost estimate, and final disposition.

### Edge Cases

- Submitted evidence includes secrets, credentials, regulated data, production customer content, or unapproved domains.
- Automated verification passes but a high-confidence human reviewer reports a severe defect.
- Human reviewers return contradictory responses or flag the artifact as too redacted to judge.
- A provider returns duplicate, late, expired, or invalid submissions.
- A job reaches its deadline while human review is still pending.
- Acceptance criteria are too vague for either automated or human verification to answer objectively.
- The same agent loops through repeated retries without improving the outcome.
- Gold or attention checks indicate reviewer quality has degraded.
- Historical self-verification and human-verification results drift apart for a component or task family.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST accept verification jobs from agents, continuous review flows, or release gates with task metadata, acceptance criteria, risk hints, budget constraints, deadlines, and evidence references.
- **FR-002**: The system MUST create a stable job identity, preserve links to parent retries, and prevent duplicate processing of equivalent submissions.
- **FR-003**: The system MUST maintain separate internal evidence packages and sanitized human review packages.
- **FR-004**: The system MUST classify evidence by privacy and risk before any external human or external model review can occur.
- **FR-005**: The system MUST block public external review for secrets, credentials, production customer content, regulated data, or any evidence that fails privacy policy.
- **FR-006**: The system MUST produce a recorded externalization decision for every human review package, including the policy basis and redaction outcome.
- **FR-007**: The system MUST evaluate submitted work with automated checks for observable completion, artifact sufficiency, visual consistency, text presence, layout issues, accessibility-relevant failures, runtime errors, and acceptance-criteria coverage where such checks are possible.
- **FR-008**: The system MUST assign a confidence level and recommended next action after automated verification.
- **FR-009**: The system MUST decide among final pass, final fail, agent retry, artifact recapture, external human review, internal or managed human review, adjudication, and fail-closed outcomes.
- **FR-010**: The system MUST route human review by privacy class, reviewer pool eligibility, provider capability, budget, deadline, risk tier, provider health, and task type.
- **FR-011**: The system MUST support at least one public low-risk reviewer pool, one internal reviewer pool, and a provider-neutral path for future managed or specialist reviewer pools.
- **FR-012**: The system MUST present human reviewers only observable task summaries, sanitized evidence, acceptance criteria, answer controls, severity choices, confidence choices, artifact-quality flags, and evidence notes.
- **FR-013**: Human reviewers MUST NOT receive hidden agent reasoning, raw internal logs, raw network payloads, credentials, customer data, internal prompts, or biased statements about automated verdicts.
- **FR-014**: The system MUST collect structured human responses with overall verdict, per-criterion results, severity, defect category, confidence, artifact sufficiency, evidence note, and optional visual annotation.
- **FR-015**: The system MUST validate and filter human responses using required fields, consistency checks, reviewer eligibility, quality checks, duplicate rules, response timing, and known-answer review tasks where applicable.
- **FR-016**: The system MUST aggregate human responses into criterion-level consensus using reviewer reliability, response quality, risk tier, and severity.
- **FR-017**: The system MUST preserve credible severe defect reports for adjudication rather than allowing low-detail majority pass votes to hide them.
- **FR-018**: The system MUST route unresolved disagreement, release-gating uncertainty, privacy concern, severe minority reports, or self-versus-human conflicts to adjudication when policy allows.
- **FR-019**: The system MUST record a final verdict with per-criterion outcomes, final confidence, severity, evidence references, human consensus summary, adjudication summary when present, cost, latency, and retry recommendation.
- **FR-020**: The system MUST return machine-readable feedback to the agent that includes failed criteria, defect category, severity, evidence pointers, retry permission, retry reason, repair hint, policy constraints, and remaining budget or attempt limits.
- **FR-021**: The system MUST enforce cost caps at job, agent-run, project, provider, risk-tier, and daily levels.
- **FR-022**: The system MUST enforce latency controls, deadlines, provider fallback rules, and release-gate behavior for expired or incomplete jobs.
- **FR-023**: The system MUST maintain audit logs for job state changes, evidence hashes, privacy decisions, reviewer routing, human responses, consensus decisions, adjudication decisions, provider outcomes, costs, and final verdicts.
- **FR-024**: The system MUST support retention policies that differ for raw evidence, sanitized packages, reviewer responses, reviewer identifiers, aggregate metrics, and approved calibration examples.
- **FR-025**: The system MUST report operational metrics for volume, automated verification quality, escalation reasons, human review quality, provider health, costs, agent retries, release blocks, privacy denials, and self-versus-human drift.
- **FR-026**: The system MUST support calibration loops that use adjudicated outcomes to improve future confidence thresholds, escalation decisions, reviewer quality scoring, gold tasks, defect taxonomy, and acceptance-criteria authoring.

### Key Entities

- **Verification Job**: A request to verify an agent or release outcome; includes identity, source, acceptance criteria, risk class, budget, deadline, state, evidence references, retry links, and final disposition.
- **Artifact Manifest**: A record of evidence submitted for a job, including screenshots, before/after evidence, text extraction, accessibility-relevant structure, runtime summaries, provenance, hashes, and sufficiency status.
- **Privacy Classification**: The risk and externalization decision for job evidence, including allowed reviewer pools, redaction requirements, blocked data classes, policy version, and audit outcome.
- **Acceptance Criterion**: An observable requirement to verify; includes criticality, human-visible wording, evidence mapping, pass threshold, and associated verdict status.
- **Self Verification Result**: Automated evidence assessment with criterion statuses, confidence, artifact-quality findings, failure categories, and suggested next action.
- **Human Review Task**: A sanitized, immutable package sent to eligible reviewers; includes observable criteria, redacted evidence, reviewer instructions, answer schema, quality controls, and cost/deadline policy.
- **Human Response**: A structured reviewer submission with per-criterion judgment, severity, defect category, confidence, evidence note, quality flags, and optional annotation.
- **Reviewer Pool**: A group of eligible reviewers, such as public crowd, qualified crowd, internal staff, managed reviewers, or domain specialists, with privacy and quality constraints.
- **Provider Capability Profile**: A provider-neutral declaration of reviewer pool types, task forms, eligibility controls, callbacks or collection methods, payment handling, bulk operations, privacy support, and operational limits.
- **Consensus Result**: Aggregated human review outcome with criterion probabilities or equivalent confidence, disagreement status, severity handling, quorum state, and adjudication recommendation.
- **Final Verdict**: The authoritative pass, fail, unclear, retry, recapture, adjudication, or fail-closed result for the job.
- **Agent Feedback Signal**: The machine-readable result returned to the agent or release gate with failed criteria, severity, evidence pointers, retry policy, repair guidance, and budget state.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 95% of verification jobs with complete evidence produce a final pass, fail, retry, recapture, human-review, or fail-closed decision within the job's configured deadline.
- **SC-002**: 100% of public external human review packages have a recorded privacy classification, redaction decision, and audit entry before dispatch.
- **SC-003**: 0 known secrets, credentials, regulated data, or production customer records are included in public external human review packages during validation runs.
- **SC-004**: At least 90% of automated high-confidence pass or fail decisions agree with subsequent human or adjudicated audit samples after calibration.
- **SC-005**: At least 95% of human review tasks collect all required structured response fields needed for consensus and agent feedback.
- **SC-006**: Release-gating jobs with credible severe human defect reports are adjudicated or blocked according to policy 100% of the time.
- **SC-007**: Budget controls prevent paid review spend from exceeding configured job, run, project, provider, and daily caps in 100% of tested scenarios.
- **SC-008**: Operators can trace any final verdict back to source evidence, privacy decision, automated checks, human responses, consensus or adjudication, cost, latency, and final feedback within 5 minutes.
- **SC-009**: Agent feedback is specific enough that at least 80% of retryable failed jobs can be categorized into artifact recapture, visual/layout issue, missing or wrong state, accessibility-relevant issue, data mismatch, runtime failure, privacy block, or ambiguous criteria.
- **SC-010**: Adding a second human review provider class requires no change to the job, verdict, privacy, consensus, or feedback concepts visible to operators.

## Assumptions

- The first production slice uses synthetic or staging evidence only; production customer evidence is out of scope for public external review.
- Public external review is limited to low-risk, redacted, observable UI verification tasks.
- Sensitive or high-risk review uses internal or managed reviewers unless an approved policy explicitly allows another path.
- Automated verification and human review both evaluate observable outcomes, not hidden agent reasoning.
- Human review providers supply observations only; the system owns privacy policy, final verdicts, release decisions, consensus, adjudication, and feedback.
- Early consensus can start with a simple reliability-weighted quorum and manual adjudication, then mature through calibration.
- Provider names in the source brief are examples of provider classes; the core product model remains provider-neutral.
- Payment and rejection policies favor fair payment for valid effort and reject only spam, non-effort, missing required answers, or policy-violating submissions.
- The supplied constitution file is still a placeholder template and does not add project-specific constraints.
