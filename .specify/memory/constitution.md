<!--
Sync Impact Report
Version change: template -> 1.0.0
Modified principles:
- Placeholder Principle 1 -> I. Evidence Before Review
- Placeholder Principle 2 -> II. Privacy Gate Before Externalization
- Placeholder Principle 3 -> III. Provider-Neutral Human Review
- Placeholder Principle 4 -> IV. Separate Consensus and Adjudication
- Placeholder Principle 5 -> V. Machine-Readable Feedback and Auditability
Added sections:
- System Boundaries
- Development Workflow and Quality Gates
Removed sections:
- None
Templates requiring updates:
- updated: .specify/templates/plan-template.md
- updated: .specify/templates/spec-template.md
- updated: .specify/templates/tasks-template.md
- not present: .specify/templates/commands/*.md
Follow-up TODOs:
- None
-->
# AI Human Review Broker Constitution

## Core Principles

### I. Evidence Before Review
Every verification job MUST start from a structured evidence bundle, not a free-form
agent claim. The bundle MUST include stable job identity, acceptance criteria,
artifact manifests, hashes, provenance, environment metadata, and the self-verification
results available for the task. Human reviewers verify observable outcomes only; they
MUST NOT receive hidden chain-of-thought, internal agent reasoning, or vague requests
such as whether the agent "did the task correctly".

Rationale: reliable human review depends on reviewable artifacts and measurable
criteria. Evidence-first intake prevents subjective review prompts and enables retry,
audit, replay, and release-gate decisions.

### II. Privacy Gate Before Externalization
Raw artifacts MUST remain internal by default. Before any artifact, screenshot, DOM
snippet, log summary, trace summary, or task metadata leaves the internal vault, the
privacy gate MUST classify the data, redact unsafe content, enforce environment and
route allowlists, record the externalization decision, and fail closed when no approved
review route exists. Public marketplace review MUST be limited to approved low-risk,
sanitized packages.

Rationale: the broker handles screenshots, logs, traces, internal URLs, customer data,
credentials, and unreleased product state. Provider integrations are not allowed to
become accidental data-exfiltration paths.

### III. Provider-Neutral Human Review
The core job, task, assignment, reviewer response, and verdict models MUST remain
provider-neutral. MTurk, Prolific, managed vendors, and internal reviewer pools are
adapters that collect human observations; they MUST NOT own verification semantics,
privacy policy, retry policy, task UI semantics, final verdicts, or release decisions.
Provider-specific fields MUST be isolated behind adapter capability models and mapping
layers.

Rationale: MTurk is the first likely external adapter, not the architecture. A second
provider or internal reviewer path must be addable without rewriting the verification
lifecycle.

### IV. Separate Consensus and Adjudication
Human responses MUST be normalized before aggregation. Consensus logic MUST account for
quorum, reviewer reliability, gold-task performance, response validation, disagreement,
severity, and artifact sufficiency. Adjudication MUST be a separate decision layer for
high-risk, unclear, sensitive, or disputed cases. Release-gating verdicts MUST NOT be
inferred directly from raw provider assignments.

Rationale: public worker answers are observations, not governance decisions. Separating
response collection from final adjudication preserves quality and makes policy decisions
auditable.

### V. Machine-Readable Feedback and Auditability
Final outcomes MUST be emitted as machine-readable feedback signals that agents, CI,
release gates, issue trackers, and dashboards can consume. Every state transition,
artifact hash, privacy decision, self-check result, human response, consensus result,
adjudication decision, budget decision, and final verdict MUST be traceable in an
immutable verdict ledger. Observability MUST include costs, latency, provider health,
privacy blocks, self-vs-human disagreement, false positives, false negatives, and retry
success.

Rationale: the broker exists to close the loop between autonomous agents and human
verification. Free-form comments are insufficient for automated retry, release blocking,
calibration, or post-incident analysis.

## System Boundaries

The verification control plane owns job intake, artifact manifests, the internal artifact
vault, criteria compilation, privacy classification, self-verification, escalation policy,
external task brokering, provider adapters, human task UI contracts, result ingestion,
consensus, adjudication, verdict ledger, feedback signals, budgets, safety controls, and
observability.

Agents and CI systems produce task outputs and evidence, then consume structured verdicts
and retry signals. They MUST NOT decide whether private artifacts can be externalized.
Applications under test supply UI state, screenshots, logs, traces, and accessibility data
from approved environments. External providers receive only sanitized work packages and
return structured observations. Release systems consume final verdicts, not raw human
assignments.

Initial implementation MUST use staging or synthetic environments, redacted screenshots,
objective visual criteria, internal reviewer fallback, and explicit cost caps. The MTurk
adapter MUST remain thin and MUST NOT dispatch production external tasks until privacy,
rubric, and adjudication behavior are proven.

## Development Workflow and Quality Gates

Each feature specification MUST define observable acceptance criteria, required evidence,
data classification, externalization policy, reviewer route, fail-closed behavior, budget
limits, and machine-readable feedback shape. Ambiguous or subjective criteria MUST be
clarified before implementation.

Each implementation plan MUST pass the Constitution Check before Phase 0 research and
again after Phase 1 design. The check MUST cover evidence contracts, privacy gate behavior,
provider-neutral boundaries, consensus and adjudication rules, feedback signals, ledger
events, observability, and budget controls.

Task plans MUST include contract/model work before provider integration, privacy and
redaction before external review, self-verification before human escalation, internal
review before public marketplace dispatch, and verification tasks that prove fail-closed
behavior. Tests are mandatory for contracts, privacy gates, escalation policy, consensus,
adjudication, adapter mapping, feedback signals, and ledger state transitions.

## Governance

This constitution supersedes conflicting project practices for the AI Human Review Broker.
Every specification, plan, task list, implementation, and review MUST demonstrate
compliance with the Core Principles or document a justified violation in the plan's
Complexity Tracking section.

Amendments require a written change to this file, a Sync Impact Report, review of dependent
templates and runtime guidance, and validation that no unexplained placeholders remain.
Version changes follow semantic versioning:

- MAJOR: Removes or redefines a core principle, changes governance authority, or permits
  behavior previously forbidden by this constitution.
- MINOR: Adds a principle, section, mandatory workflow gate, or materially expands required
  architecture or compliance behavior.
- PATCH: Clarifies wording, fixes non-semantic errors, or tightens examples without changing
  obligations.

Compliance review is required during planning, implementation review, and completion
verification. Any feature that cannot meet privacy, evidence, adjudication, or auditability
requirements MUST fail closed until an approved internal-only or managed-review path exists.

**Version**: 1.0.0 | **Ratified**: 2026-05-31 | **Last Amended**: 2026-05-31
