# Quickstart: Provider Integration

## 1. Configure the Real Provider Locally

Prepare and validate:

- provider credential source
- provider account or workspace scope
- callback or retrieval configuration
- local fallback mode

## 2. Start the Runtime

Run the documented local startup commands and confirm:

- provider configuration validates successfully
- the adapter is enabled
- the local fallback path remains available

## 3. Run the Real Dispatch Scenario

1. Create an eligible verification job
2. Route the review task to the real provider
3. Confirm the provider task mapping is recorded
4. Ingest at least one provider response
5. Verify normalized response, consensus, adjudication, verdict, and feedback behavior

## 4. Run the Failure and Fallback Scenario

Exercise one invalid-credential or degraded-provider case and confirm:

- the runtime reports the error clearly
- no secret values appear in logs
- the documented fallback or blocked behavior occurs

## 5. Run the Local Proof Path

```bash
npm run lint
npm run build
npm test
```

Then run the documented local provider validation workflow and inspect the expected dispatch and ingestion evidence.
