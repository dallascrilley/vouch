# Provider Integration Validation

## Local Proof Path

```bash
npm run lint
npm run build
npm test
npm run validate:provider
```

## Expected Evidence

- A managed review task returns `dispatch_status: "dispatched"`
- A provider task mapping is recorded before callback ingestion
- Restarting the app with the same `PROVIDER_SQLITE_PATH` preserves provider task mappings
- Callback ingestion records a receipt and a normalized human response
- Invalid startup config fails before the app accepts traffic
- Secret-safe logs redact provider credentials
