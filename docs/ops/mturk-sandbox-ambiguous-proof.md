# MTurk Sandbox Ambiguous / Fail Proof — Manual Adjudication Path

Captured as an **offline proof bundle** on 2026-06-14 (`td-d3d492`). Models the
return path when a sandbox worker submits an **unclear** verdict so the broker
must **not** auto-advance (`auto_advanced: false`) and instead waits for
consensus + adjudication before agent-facing feedback exists.

Live Bux sandbox with real AWS assignment IDs remains optional regression; the
default gate is offline replay (same pattern as `mturk-sandbox-pass-v1` /
`mturk-sandbox-fail-v1`).

## Summary

| Check | Result |
|-------|--------|
| Provider callback ingested | yes — simulated assignment `SIM-AMBIGUOUS-ASSIGNMENT-0001` |
| `auto_advanced` on callback | **false** — ambiguous signal stays manual |
| Feedback before adjudication | **404** — no premature agent verdict |
| Consensus recorded | yes — `provider_disagreement` trigger |
| Adjudication → retry | yes — `final_verdict: retry` on feedback + verdict APIs |
| Offline replay gate | yes — `npm run validate:provider-proof-bundle -- mturk-sandbox-ambiguous-v1` |

## Correlation IDs (simulated reference)

| Field | Value |
|-------|-------|
| HIT ID | `SIM-AMBIGUOUS-HIT-0001` |
| Assignment ID | `SIM-AMBIGUOUS-ASSIGNMENT-0001` |
| Worker pseudonym | `SIM-WORKER-UNCLEAR` |
| Sanitized package ID | `mturk-visual-hero-cta-ambiguous-sim-package` |
| Criterion | `hero-cta-no-overlap` |

Replace these with live Bux IDs when a sandbox HIT is run end-to-end; update
`tests/fixtures/provider-return-path/mturk-sandbox-ambiguous-v1/manifest.json`
`reference_correlation_ids` and replay files from captured payloads.

## Callback shape (unclear → no auto-advance)

Worker returns `overall_verdict: unclear` with criterion `status: unclear`,
`confidence: medium`. Broker callback response:

```json
{ "auto_advanced": false }
```

Feedback API returns **404** until consensus and adjudication complete.

## Adjudication flow

After callback, orchestrator (or test harness) posts:

1. `POST /verification-jobs/{job_id}/consensus` — `recommended_outcome: adjudicate`
2. `POST /verification-jobs/{job_id}/adjudications` — `decision: retry`

Then feedback and verdict APIs return `final_verdict: retry` with provider
correlation preserved.

## Proof bundle

```text
tests/fixtures/provider-return-path/mturk-sandbox-ambiguous-v1/
  manifest.json
  job-setup.json
  callback.json
  bridge-state.json
  adjudication-flow.json   # consensus + adjudication payloads
  expected.json
```

Integration coverage: `tests/integration/provider-proof-bundle-replay.test.ts`
(case: `mturk-sandbox-ambiguous-v1`).

## Validate offline

```bash
npm run validate:provider-proof-bundle -- mturk-sandbox-ambiguous-v1
```

Expect exit `0` and JSON with `"auto_advanced": false`, `"final_verdict": "retry"`.

## Live Bux extension (optional)

When AWS sandbox creds are available on Bux:

1. Dispatch HIT with rubric that encourages **unclear** / **no** answers.
2. Submit worker assignment on sandbox.
3. Confirm bridge delivers callback; broker returns `auto_advanced: false`.
4. Run consensus/adjudication (or let orchestrator auto-run if wired).
5. Export payloads into the proof bundle and add real IDs to this doc.
6. Optionally wire `validate:mturk-phase6` with new job/HIT env vars.

See `docs/ops/bux-mturk-runbook.md` § Ambiguous / fail case.

## Distinction from unanimous fail auto-advance

`mturk-sandbox-fail-v1` covers **high-confidence unanimous fail** →
`auto_advanced: true` → `final_verdict: fail` with `provider_auto_resolved`.

This proof covers **ambiguous** worker signal → manual path → **retry** after
human adjudication. Both are required for complete sandbox return-path coverage.
