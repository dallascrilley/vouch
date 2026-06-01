# Provider Integration Local Setup

## Required Local Environment

- `PROVIDER_ENABLED=true`
- `PROVIDER_ID=real-provider`
- `PROVIDER_DISPATCH_MODE=mock` for local validation or `api` for a live endpoint
- `PROVIDER_INGESTION_MODE=callback`
- `PROVIDER_API_KEY` from a local secret source
- `PROVIDER_CALLBACK_BASE_URL=http://localhost:3000`
- `PROVIDER_SHARED_SECRET` for callback validation
- `PROVIDER_SQLITE_PATH=.runtime/provider-state.sqlite` for durable provider task and receipt state

## Validation

Run:

```bash
npm run validate:provider
```

This validates the required local provider fields before any dispatch attempt.

## Durable State

Provider task mappings and callback receipts are persisted in the SQLite file at
`PROVIDER_SQLITE_PATH`. For the default local workflow this should live under
`.runtime/provider-state.sqlite`.
