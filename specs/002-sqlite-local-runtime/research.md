# Research: SQLite Local Runtime

## Decision: SQLite-backed persistence for the first deployable runtime

**Rationale**: The feature explicitly requires SQLite, local-only operation, and restart durability. SQLite gives transactional durability, simple distribution on a developer machine, and a low operational footprint while still supporting the required structured records for jobs, review state, verdicts, feedback, and ledger events.

**Alternatives considered**:

- Continue using in-memory repositories: rejected because restart durability is the core problem.
- PostgreSQL for this phase: stronger long-term multi-process story, but conflicts with the requested SQLite-first local runtime.
- Flat files only: insufficient for relational verification state and lifecycle queries.

## Decision: Local queue state coordinated through SQLite

**Rationale**: The runtime must remain local-only and avoid hosted queue services. Using SQLite-backed queue coordination or claim records preserves restart behavior and avoids introducing a separate broker.

**Alternatives considered**:

- Hosted queue service: rejected by the local-only requirement.
- Pure in-memory worker lists: rejected because they lose state on restart.
- Filesystem-only queue files: possible, but weaker than structured SQLite records for visibility and coordination.

## Decision: Local provider simulation instead of hosted marketplace integration in this feature

**Rationale**: The goal is a deployable local runtime that preserves provider-neutral behavior. Local provider simulation allows routing, response ingestion, consensus, and adjudication to be exercised without external accounts, rate limits, or network dependencies.

**Alternatives considered**:

- Wire a real hosted marketplace now: rejected by the local-only requirement.
- Remove human-review behavior entirely: rejected because the runtime must still preserve verification semantics.

## Decision: Preserve current HTTP contracts while swapping runtime internals

**Rationale**: Existing contract and integration tests already define the user-visible behavior. Holding those contracts stable while replacing persistence and queue internals is the lowest-risk migration path.

**Alternatives considered**:

- Redesign route contracts during the runtime upgrade: would mix migration risk with user-facing changes.
- Introduce a separate local-only API surface: unnecessary split for this phase.

## Decision: Local validation is the authoritative operational proof

**Rationale**: The feature explicitly disallows GitHub Actions as an operating dependency. Local lint, type check, tests, contract validation, restart proof, and quickstart validation become the required operator-facing validation path.

**Alternatives considered**:

- Keep GitHub Actions as the main proof path: rejected by the requirement.
- Rely on only unit tests: too weak to prove local restart durability and local operational flow.
