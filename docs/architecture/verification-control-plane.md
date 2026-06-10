# Verification Control Plane Architecture

## Core Flow

1. Job intake creates or reuses a `VerificationJob`.
2. Artifact attachment records immutable evidence references.
3. Privacy classification decides whether evidence can be externalized.
4. Self-verification produces a direct verdict or pushes to human review.
5. Human review tasks collect structured observations.
6. Consensus aggregates those observations.
7. Adjudication resolves severe or disputed cases.
8. Final verdict and feedback are emitted for agents and release gates.

`docs/architecture/agent-review-contract.md` defines the agent-facing
commissioning and completion fields for autonomous self-verification loops.

## Main Modules

- `src/domain/jobs`: job identity, acceptance criteria, and budget policy
- `src/domain/artifacts`: artifact manifests and artifact handling
- `src/domain/privacy`: privacy gate and externalization policy
- `src/domain/self-verification`: self-verification result handling
- `src/domain/human-review`: task creation, response validation, provider registry, routing, and provider operations
- `src/domain/consensus`: consensus aggregation
- `src/domain/adjudication`: adjudicated outcomes
- `src/domain/feedback`: verdicts, feedback signals, and calibration
- `src/domain/ledger`: append-only ledger and retention policy
- `src/api`: Fastify routes and in-memory composition root
- `src/workers`: queue handler entrypoints

## Current Runtime Shape

The app currently uses in-memory repositories and provider stubs so the lifecycle
can be exercised by tests without requiring PostgreSQL, object storage, or live
provider accounts. The repository and adapter interfaces are already defined to
support a later swap to durable implementations.
