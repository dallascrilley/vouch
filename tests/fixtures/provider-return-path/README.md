# Provider return-path proof bundles

Versioned offline fixtures derived from live sandbox proofs. Each bundle captures the
job setup, provider callback payload, bridge state excerpt, and expected broker outcomes
so `provider-test-app` can replay the return path without Staging, AWS, or a live bridge.

## Layout

```text
<bundle-id>/
  manifest.json      # metadata + reference correlation IDs from source proof
  job-setup.json     # verification job, artifacts, privacy, human-review task
  callback.json      # provider callback payload (provider_task_id filled at replay)
  bridge-state.json  # bridge delivery excerpt for cross-check scripts
  expected.json      # assertions after callback replay
```

## Adding a bundle from sandbox proof

1. Capture correlation IDs and payloads from `docs/ops/mturk-sandbox-e2e-proof.md` (or a new proof doc).
2. Create a new directory under `tests/fixtures/provider-return-path/`.
3. Add JSON files; keep `reference_correlation_ids` in manifest for traceability.
4. Add or extend `tests/integration/provider-proof-bundle-replay.test.ts`.
5. Optional: run `npm run validate:provider-proof-bundle -- <bundle-id>`.

Live sandbox remains optional regression; offline replay is the default gate for return-path changes.
