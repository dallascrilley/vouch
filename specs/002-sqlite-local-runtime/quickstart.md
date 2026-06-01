# Quickstart: SQLite Local Runtime

## 1. Configure Local Runtime Paths

Choose and document:

- SQLite database path
- Local artifact storage directory
- Local queue state directory or table strategy

## 2. Start the Service Locally

Run the documented local startup commands and verify:

- configuration loads successfully
- persistence initializes successfully
- queue coordination initializes successfully
- service accepts verification work only after runtime checks pass

## 3. Run the Durability Scenario

1. Create a verification job
2. Attach artifacts
3. Record privacy classification
4. Record self-verification or human-review work
5. Restart the service
6. Re-query job, verdict, feedback, and ledger state

Expected result: persisted records remain available and semantically unchanged after restart.

## 4. Run the Local Validation Path

Run the local proof commands:

```bash
npm run lint
npm run build
npm test
```

Then run the local quickstart validation scenario and inspect the documented runtime evidence.

## 5. Validate Local-Only Constraints

- No GitHub Actions dependency is required to operate or validate this feature.
- Local provider simulation is sufficient to exercise human-review, consensus, and adjudication flows.
- Reset and inspection commands are documented for the local runtime artifacts and database.
