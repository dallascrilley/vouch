# Research: Provider Integration

## Decision: Add one real provider adapter while keeping local simulation available

**Rationale**: The feature needs to prove that the provider-neutral architecture can drive one real external provider without removing the local-only fallback and simulation behavior already used for validation and privacy-safe cases.

**Alternatives considered**:

- Add multiple providers now: broader coverage, but too much scope for the first real integration.
- Replace local simulation entirely: would weaken validation and fallback behavior.

## Decision: Keep local validation as the authoritative proof path

**Rationale**: The feature explicitly disallows GitHub Actions as an operating dependency. The provider integration must be provable from a development machine with local commands, local config, and local logs.

**Alternatives considered**:

- Hosted CI as the primary proof path: rejected by the requirement.
- Provider-only smoke testing without local regression tests: too weak to protect verification semantics.

## Decision: Persist provider task and response mapping in the existing local runtime store

**Rationale**: Provider mapping is part of the verification state and needs the same durability, auditability, and restart behavior as the rest of the workflow.

**Alternatives considered**:

- Keep provider IDs only in memory: loses restart continuity.
- Store provider mappings in separate ad hoc files: weakens consistency and traceability.

## Decision: Support a single real ingestion path with duplicate-safe handling

**Rationale**: Whether the provider returns data via callback or retrieval, the runtime must normalize it through one stable path and tolerate duplicate or delayed deliveries.

**Alternatives considered**:

- Multiple ingestion paths from day one: increases risk and test surface unnecessarily.
- Manual copy-paste ingestion: not enough to prove the real adapter path.

## Decision: Secret handling remains local and explicit

**Rationale**: The first real provider introduces credentials and callback configuration risk. The feature must validate secrets locally, avoid leaking them to repository files or logs, and still allow reproducible setup.

**Alternatives considered**:

- Commit placeholder secret values in config: unsafe and misleading.
- Depend on hosted secret managers for the validation path: conflicts with the local-only operating model.
