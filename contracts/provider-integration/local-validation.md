# Local Validation Contract: Provider Integration

## Purpose

Defines the local-only validation expectations for the real provider adapter.

## Required Guarantees

- Local setup validates provider credentials and adapter configuration before dispatch.
- Local validation commands prove dispatch, response ingestion, fallback behavior, and secret safety.
- No required validation step depends on GitHub Actions.

## Secret Handling Contract

- Secrets are supplied through local configuration surfaces that do not require committing secret values.
- Logs, docs, and validation artifacts must not expose provider secrets.

## Fallback Contract

- When the provider is degraded, disabled, or rejected by policy, the runtime uses documented fallback or blocked behavior.
- Local simulation or internal review remains available as a safe fallback path.
