# 0001. Persistence boundary for the production runtime

- **Status:** accepted for option B; implementation deferred to the PostgreSQL phase
- **Date:** 2026-08-18

Answers the RFC requested in issue #1. Written against `59219fd`.
The transaction contract decision is now settled; the production adapter work is not.

## Decision: ambient transaction context (option B)

The future asynchronous persistence adapter will keep the callback-only
`TransactionManager` surface and bind its selected pooled connection to
`AsyncLocalStorage` for the duration of `inTransaction`. Repository calls made
inside the callback must resolve that ambient connection; calls outside a
transaction use an ordinary non-transaction connection.

This is a boundary decision, not a claim that PostgreSQL support exists today.
The shipped SQLite path remains unchanged: one `DatabaseSync` connection,
`AsyncLocalStorage` for genuine nesting, and a serialized top-level queue. The
cross-connection escape test becomes a required phase-1 proof when the first
pooled adapter lands; it cannot be meaningfully exercised before that adapter
exists.

## Context

The broker ships a SQLite-first local runtime. Spec 001 planned PostgreSQL,
pg-boss, S3, and OpenTelemetry, and
[`runtime-target.md`](../architecture/runtime-target.md) records that none of
those adapters exist. Issue #1 asks which module boundary makes that migration
possible without breaking the SQLite path, `npm run verify`, or the existing
test suites.

The useful finding is that **the boundary is already in better shape than the
issue assumes, with one exception that is not a layout problem at all.**

## What the code already gets right

`src/adapters/storage/repositories.ts` defines 17 repository interfaces in
terms of domain models only — no SQLite types leak through them. The SQLite
implementations are already split by aggregate (`sqlite-job-repositories.ts`,
`sqlite-review-repositories.ts`, `sqlite-verdict-repositories.ts`,
`provider-sqlite-repositories.ts`). `QueuePublisher` / `QueueWorker` in
`src/adapters/queue/queue.ts` and `ArtifactStore` in
`src/adapters/storage/artifact-store.ts` are likewise provider-neutral.

A Postgres adapter set can be added beside these and selected in the
composition root. **No port renaming or domain change is required**, which is
the constraint issue #1 leads with.

## The exception: `TransactionManager` cannot survive as written

```ts
export interface TransactionManager {
  inTransaction<T>(operation: () => Promise<T>): Promise<T>;
}
```

The signature carries **no transaction handle**. It works today only because
`SQLiteRuntimeStore` owns a single `DatabaseSync` connection that every
repository writes through, so "inside a transaction" is a property of the
process, not of anything passed to the repository.

Under a pooled async driver that assumption inverts. A repository call inside
`inTransaction` checks out _a different connection_ and runs outside the
transaction — silently. Nothing fails; atomicity is simply gone, and the SQLite
test suite cannot detect it because on SQLite the code is correct.

This is not hypothetical. #44 fixed a defect with exactly this shape: nesting
was tracked per-instance rather than per-async-context, so a second request
could join the first request's transaction and lose its writes to an unrelated
rollback. That was unreachable on SQLite because transactions never yield; it
would be routine under Postgres.

**This is the decision issue #1 actually needs to make.** Two viable shapes:

| Option                 | Shape                                                                                            | Trade-off                                                                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Explicit handle** | `inTransaction<T>(op: (tx: Tx) => Promise<T>)`, and every repository method takes `tx`           | Honest and type-checked; the compiler finds every call site. Touches all 17 interfaces and every domain service.                                                        |
| **B. Ambient context** | Keep the signature; the Postgres adapter resolves the pooled connection from `AsyncLocalStorage` | No domain churn; matches what #44 already introduced. Correctness is invisible in the types — a repository used outside a transaction silently gets its own connection. |

Option B is the selected shape. It preserves the ports the issue asked to
preserve, and #44 already established `AsyncLocalStorage` in this exact class,
so the mechanism is not new. The cost is that the invariant lives in review
and tests rather than in the compiler. The required phase-1 test must assert
that a repository call inside `inTransaction` uses the ambient transaction
connection while a call outside it uses a different connection.

## Queue

`SQLiteLocalQueueStore` implements claim-based polling in the runtime database.
The `QueueJobName` union is closed and small (`self-verification`,
`escalation`, `provider-ingestion`, `adjudication`).

pg-boss is a **later** phase than the store, and should not be bundled with it.
The queue is already behind `QueuePublisher`/`QueueWorker`, so a Postgres
deployment can keep claim-based polling against Postgres rows and still be
correct — pg-boss buys scheduling, retry policy, and archiving, not
correctness. Moving both at once couples a durability migration to a scheduling
migration for no reason.

## Artifacts

`ArtifactStore` declares provider-neutral blob APIs, but `LocalArtifactStore`
only supplies filesystem readiness, inspection, and reset helpers; it does not
implement that port and is not constructed as a blob store by the running
composition root. Artifacts are tracked as manifests and refs in SQLite; the
running system has no blob store.

So deliverable 4 of the issue is not a migration question. There is no local
artifact path to move to S3 — there is an unimplemented one. The decision is
whether to implement blob storage at all before launch, and V1–V8 do not
require it. Recommendation: leave `ArtifactStore` unwired, and treat
"implement artifact storage" as its own piece of work rather than as a
Postgres dependency.

## Provider state

`ProviderConfigRepository` is always the in-memory implementation, even with
`PROVIDER_SQLITE_PATH` set; provider config is env-derived and re-saved on
boot. `ProviderTaskMappingRepository` and `ProviderResponseReceiptRepository`
do switch on that env var. That split is correct as-is and needs no change:
config is configuration, mappings and receipts are state.

## Implementation phases

Each phase is independently shippable and independently revertible.

1. **Implement the selected transaction contract** in the first pooled
   adapter, and add the test that fails when a repository escapes the
   transaction. The current SQLite path already proves its own async-context
   and nesting behavior; this cross-connection proof requires the future
   adapter.
2. **Postgres adapters for the job/review/verdict aggregates**, selected in
   the composition root by a single env var, with SQLite remaining the default.
3. **Run both in CI** on the existing integration and contract suites. Their
   domain assertions can remain adapter-agnostic, but the current composition
   is SQLite-only; adapter-selection coverage is part of this phase.
4. **Postgres-backed queue**, still claim-based. Revisit pg-boss only if
   scheduling or archiving becomes the constraint.
5. **OpenTelemetry**, independent of all of the above.

## Consequences

- The SQLite path stays the default and the tested one; `npm run verify` and
  the six offline harnesses are unaffected by phases 1–2.
- Accepting option B does not claim that PostgreSQL support exists. The
  transaction escape test and the first pooled adapter are still required
  before production persistence can be considered verified.
- Phase 3 is the gate that makes the rest safe. Without dual-adapter CI, phase
  2 is unverifiable and the transaction defect class in #44 returns invisibly.
- Choosing B keeps all 17 repository interfaces unchanged, so the blast radius
  is one class plus adapters.
- Deferring pg-boss and S3 means the production target is reached in phases
  rather than as one cutover. `runtime-target.md` records the selected
  transaction boundary and the fact that the remaining adapters are unbuilt.

## Open, and deliberately deferred

- Whether production is a goal before the `live-crowd` hold clears at all. If
  it is not, phases 1–5 can wait; the accepted transaction boundary remains
  future-facing documentation and does not require implementation now.
- Whether to add the `pg` dependency back now or at phase 2. Adding it early
  makes phase 2 a smaller diff; leaving it out keeps the dependency surface
  honest about what actually runs.
