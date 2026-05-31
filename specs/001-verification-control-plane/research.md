# Research: Verification Control Plane

## Decision: Contract-first TypeScript control plane with Fastify

**Rationale**: The feature is a long-lived service with public control-plane interfaces, asynchronous workers, structured event payloads, provider adapters, and domain policies that need shared types across API, worker, and contract tests. TypeScript gives one language for schemas, service code, workers, and validation while keeping the first implementation approachable. Fastify fits the contract-first HTTP surface because it is schema-oriented, lightweight, and compatible with Ajv validation and OpenAPI generation/validation workflows.

**Alternatives considered**:

- Python service: strong ecosystem for evaluation and data tooling, but less direct sharing with web task UI and generated typed clients.
- Go service: strong concurrency and deployment profile, but slower iteration for schema-heavy early design and reviewer UI contracts.
- Express service: familiar and broad ecosystem, but less schema-first by default.
- Documentation-only prototype: useful for strategy, but insufficient to validate privacy, consensus, and feedback contracts.

## Decision: OpenAPI 3.1 plus JSON Schema for synchronous interfaces

**Rationale**: The control plane needs explicit, testable contracts for job intake, evidence manifests, privacy classification, review package creation, provider response ingestion, adjudication, final verdicts, and feedback retrieval. OpenAPI 3.1 aligns with JSON Schema semantics and can drive contract tests and generated clients without binding the domain to a specific framework.

**Alternatives considered**:

- Ad hoc endpoint documentation: easier initially, but likely to drift from implementation.
- GraphQL: useful for flexible client queries, but the primary workflows are command/state-transition oriented.
- Provider-native contracts only: rejected because provider neutrality is a constitutional requirement.

## Decision: PostgreSQL ledger plus S3-compatible artifact storage

**Rationale**: Jobs, policy decisions, human responses, consensus results, adjudication decisions, budget records, and ledger events need transactional relationships, auditability, and trace queries. PostgreSQL is the default relational store for these relationships and can also support early transactional queue coordination. Raw and sanitized artifacts are better stored as immutable objects referenced by hash and manifest metadata in S3-compatible storage.

**Alternatives considered**:

- Object storage only: simple artifact handling, but poor fit for state transitions, budget enforcement, and verdict traceability.
- Event store only for MVP: strong replay semantics, but unnecessary operational complexity before basic contracts and policies are proven.
- Provider-hosted records as source of truth: rejected because providers supply observations only, not final governance state.

## Decision: pg-boss durable queues for lifecycle workers

**Rationale**: Self-verification, privacy checks, provider dispatch, response ingestion, consensus, adjudication, and feedback emission can be retried independently and must tolerate provider delays or outages. pg-boss keeps the MVP queue in PostgreSQL so job state, retries, and worker coordination can be operated with the same persistence layer before volume justifies a separate broker.

**Alternatives considered**:

- Fully synchronous lifecycle: easier to reason about, but incompatible with human review latency and provider callbacks.
- Full event sourcing from day one: attractive for audit and replay, but too complex for the first implementation slice.
- Separate broker from day one: useful later for high throughput, but adds an additional operational dependency before contracts and policy behavior are proven.

## Decision: Privacy gate before human review and external model review

**Rationale**: The broker handles screenshots, logs, traces, URLs, DOM-derived text, customer data risk, and hidden agent material. Classifying and redacting evidence before externalization prevents provider integrations from becoming data-exfiltration paths and satisfies fail-closed requirements.

**Alternatives considered**:

- Trust provider confidentiality terms for all tasks: rejected for public marketplace review.
- Redact only in provider adapters: rejected because privacy policy would fragment across implementations.
- Human review first, privacy audit later: rejected because it can leak data before detection.

## Decision: Provider-neutral task and response model

**Rationale**: MTurk, Prolific, managed vendors, and internal reviewers have different operational models, but the core system needs consistent jobs, tasks, assignments, reviewer pools, response schemas, consensus, verdicts, and feedback. Adapter capability profiles keep provider-specific behavior isolated.

**Alternatives considered**:

- MTurk-first HIT model in the core: faster first adapter, but violates provider neutrality and makes a second provider expensive.
- Separate model per provider: creates duplicated consensus, privacy, and feedback semantics.

## Decision: Reliability-weighted consensus with separate adjudication

**Rationale**: Human responses are observations, not final policy decisions. Consensus must account for quorum, reliability, quality checks, disagreement, artifact sufficiency, and severity. Adjudication remains separate for high-risk, severe, sensitive, or unresolved cases.

**Alternatives considered**:

- Raw majority vote: too weak for severe minority reports and release gates.
- Always adjudicate: high quality but too slow and expensive for low-risk objective tasks.
- Provider-side consensus: rejected because release decisions must remain auditable inside the control plane.

## Decision: Machine-readable feedback and immutable ledger events

**Rationale**: Agents and release gates need structured outcomes that identify failed criteria, severity, defect category, evidence pointers, retry permission, repair hints, policy constraints, and budget state. Ledger events make final verdicts traceable and support calibration, false-positive/false-negative analysis, and incident review.

**Alternatives considered**:

- Free-form reviewer comments only: insufficient for retries, release gates, and calibration.
- Dashboard-only status: useful for operators but not enough for agent automation.
