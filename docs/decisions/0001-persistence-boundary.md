# 0001. Persistence boundary for the production runtime

- **Status:** proposed
- **Date:** 2026-08-18

Answers the RFC requested in issue #1. Written against `f9d6b7a`..`1170146`.
Proposed, not accepted: the phasing in particular is a cost decision.

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
`adapters/storage/artifact-store.ts` are likewise provider-neutral.

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

Recommendation: **B**, with A as the fallback if the ambient context proves
hard to keep honest. B preserves the ports the issue asked to preserve, and
#44 already established `AsyncLocalStorage` in this exact class, so the
mechanism is not new. The cost of B is that the invariant lives in review and
tests rather than in the compiler, so it needs a test that asserts a repository
call inside `inTransaction` and one outside land on different connections.

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

`ArtifactStore` has a port and a `LocalArtifactStore` implementation, and
**neither is constructed anywhere in `src/api/app.ts`** (verified by grep on
`1170146`). Artifacts are tracked as manifests and refs in SQLite; the running
system has no blob store.

So deliverable 4 of the issue is not a migration question. There is no local
artifact path to move to S3 — there is an unimplemented one. The decision is
whether to implement blob storage at all before launch, and V1–V8 do not
require it. Recommendation: leave `ArtifactStore` unwired, and treat "implement
artifact storage" as its own piece of work rather than as a Postgres
dependency.

## Provider state

`ProviderConfigRepository` is always the in-memory implementation, even with
`PROVIDER_SQLITE_PATH` set; provider config is env-derived and re-saved on
boot. `ProviderTaskMappingRepository` and `ProviderResponseReceiptRepository`
do switch on that env var. That split is correct as-is and needs no change:
config is configuration, mappings and receipts are state.

## Proposed phases

Each phase is independently shippable and independently revertible.

1. **Settle the transaction contract** (A or B above) and add the test that
   fails when a repository escapes the transaction. Nothing else can be
   verified before this.
2. **Postgres adapters for the job/review/verdict aggregates**, selected in the
   composition root by a single env var, with SQLite remaining the default.
3. **Run both in CI** on the existing integration and contract suites. The
   suites are adapter-agnostic today, so this is the cheapest real proof that
   the boundary holds.
4. **Postgres-backed queue**, still claim-based. Revisit pg-boss only if
   scheduling or archiving becomes the constraint.
5. **OpenTelemetry**, independent of all of the above.

## Consequences

- The SQLite path stays the default and the tested one; `npm run verify` and
  the six offline harnesses are unaffected by phases 1–2.
- Phase 3 is the gate that makes the rest safe. Without dual-adapter CI, phase
  2 is unverifiable and the transaction defect class in #44 returns invisibly.
- Choosing B keeps all 17 repository interfaces unchanged, so the blast radius
  is one class plus adapters.
- Deferring pg-boss and S3 means the production target in
  `runtime-target.md` is reached in pieces rather than as one cutover, and that
  document should be updated to describe phases rather than a single target
  shape.

## Open, and deliberately not decided here

- Whether production is a goal before the `live-crowd` hold clears at all. If
  it is not, phase 1 is still worth doing (it is a correctness fix) and phases
  2–5 can wait.
- Whether to add the `pg` dependency back now or at phase 2. Adding it early
  makes phase 2 a smaller diff; leaving it out keeps the dependency surface
  honest about what actually runs.
