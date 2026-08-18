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
Privacy classification is not client-authoritative; see
[`privacy-gate.md`](privacy-gate.md). Human-review task `idempotency_key`
replays that change identifying fields are rejected; see
[`human-review-task-idempotency.md`](human-review-task-idempotency.md).
Real-provider cost is capped by
[`docs/ops/spend-ceiling.md`](../ops/spend-ceiling.md).

## Main Modules

- `src/domain/jobs`: job identity, acceptance criteria, and budget policy
- `src/domain/artifacts`: artifact manifests and artifact handling
- `src/domain/privacy`: privacy gate, externalization policy, and health proof
- `src/domain/self-verification`: self-verification result handling
- `src/domain/human-review`: task creation, response validation, provider registry, routing, and provider operations
- `src/domain/consensus`: consensus aggregation
- `src/domain/adjudication`: adjudicated outcomes
- `src/domain/feedback`: verdicts, feedback signals, and calibration
- `src/domain/ledger`: append-only ledger and retention policy
- `src/api`: Fastify routes and SQLite composition root (`app.ts`)
- `src/api/spend-ceiling.ts`: durable real-dispatch reservation ledger
- `src/workers`: queue handler entrypoints

## Current Runtime Shape

The shipped broker is a **SQLite-first local runtime**, not an in-memory
prototype. `src/api/app.ts` wires `createSQLiteRuntimeRepositories` and a
filesystem artifact store.

| Surface                               | Shipped implementation                                                          |
| ------------------------------------- | ------------------------------------------------------------------------------- |
| Job / privacy / review / ledger state | `RUNTIME_SQLITE_PATH` (`node:sqlite`)                                           |
| Provider task mappings and receipts   | `PROVIDER_SQLITE_PATH` (in-memory only when that path is unset, which tests do) |
| Real-dispatch spend reservations      | `vouch_spend_reservations` in the runtime DB                                    |
| Queue                                 | `SQLiteLocalQueueStore` in the runtime DB                                       |
| Artifacts                             | `RUNTIME_ARTIFACT_ROOT` on disk                                                 |
| Metrics                               | `InMemoryMetricsRecorder` (no OpenTelemetry export)                             |

PostgreSQL, pg-boss, S3, and OTel adapters are **not** implemented. See
[`runtime-target.md`](runtime-target.md) for shipped vs production-target and
[`sqlite-local-runtime.md`](sqlite-local-runtime.md) for persistence surfaces.

Vitest still uses `:memory:` SQLite and in-memory provider mapping so the
lifecycle can run without live provider accounts. That test substitute is not
the developer or Docker runtime.
