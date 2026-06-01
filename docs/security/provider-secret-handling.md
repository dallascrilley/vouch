# Provider Secret Handling

Provider integration uses local-only secret loading and explicit validation.

## Rules

- Secrets are read from local environment variables, not committed files
- `npm run validate:provider` must pass before live dispatch
- Callback ingestion uses a shared secret when configured
- Provider log redaction removes bearer tokens, API keys, and shared secrets

## Residual Risks

- A live provider endpoint can still fail or degrade; degraded paths should stay
  queued or blocked rather than silently bypassing policy
- Local operators must avoid shell history or copied logs that contain raw env
  values before redaction
