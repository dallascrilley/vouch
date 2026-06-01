# Runtime Contract: SQLite Local Runtime

## Purpose

Defines the required local runtime behavior for SQLite-backed persistence, queue coordination, restart durability, and provider simulation.

## Required Guarantees

- Verification jobs, criteria, manifests, privacy decisions, review tasks, responses, consensus records, adjudications, verdicts, feedback signals, and ledger events persist across process restarts.
- Local queue claims survive restart or fail deterministically into a recoverable state.
- Route contracts remain externally equivalent to the existing verification service.
- Fail-closed and budget-blocked behaviors remain durable and queryable after restart.

## Local Storage Surfaces

- SQLite database file for structured verification state
- Local artifact directory for evidence and sanitized packages
- Local queue state stored alongside or within the SQLite runtime

## Startup Contract

- Service startup MUST validate database path, artifact root, and queue state path before accepting work.
- Startup MUST fail clearly when paths are invalid, locked, unwritable, or incompatible with the expected runtime version.
- Service startup MUST apply local schema migrations or refuse startup with a precise migration error.

## Restart Contract

- After restart, jobs retain last committed state.
- Final verdict and feedback queries must return the same result as before restart for already finalized jobs.
- In-flight queue work must either resume safely or surface a deterministic recoverable state.
