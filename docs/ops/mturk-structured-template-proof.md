# Structured-template MTurk sandbox proof

Real-sandbox validation of the agent-loop integration
(`docs/architecture/agent-loop-integration.md`): one CLI call produced a live
MTurk sandbox HIT rendered from a structured task-template envelope with
per-dispatch pricing.

Run on Bux (the MTurk-linked AWS host per `bux-mturk-runbook.md`) from
`~/Code/ai-human-review-broker-agent-loop` (rsync of branch
`agent-loop-integration`), broker on `:3200`, bridge on `:3300`, on
2026-06-10. The pre-existing phase-6 stack on `:3000`/`:3100` was left
untouched.

## Command

```bash
export BROKER_BASE_URL=http://127.0.0.1:3200
npm run -s review -- \
  --template binary_screenshot_check \
  --question "hero-cta-no-overlap:The orange Commission review CTA is below the hero headline and does not overlap it." \
  --screenshot .runtime/hero-embed.jpg \
  --caption "Hero section at 1440x900" --viewport 1440x900 \
  --risk low --no-wait
```

Output:

```json
{
  "estimated_cost_usd": 0.12,
  "job_id": "job_6c7917d6-7a3e-455f-8467-dbaa375241d7",
  "provider_task_id": "3CMIQF80GORTZMGWF24P7EIOFH06QV",
  "review_task_id": "review_563e9258-e290-4179-9523-fe79dee2aac9",
  "timed_out": false
}
```

## AWS verification (`aws mturk get-hit`)

- `HITId`: `3CMIQF80GORTZMGWF24P7EIOFH06QV`, `HITTypeId`:
  `3XIWDYX973CHIROI2OXPXYKX1Y9Q1M`, `HITStatus`: `Assignable`
- `Reward`: **0.10** — the envelope's low-risk preset, not the bridge-wide
  `MTURK_REWARD=0.05` default → per-dispatch pricing works on real AWS
- `MaxAssignments`: 1 (low-risk preset)
- Question XML (82,365 chars) contains the structured form — the perception
  question, the "Can't tell" option, and the `minlength="15"` rationale — and
  does **not** contain the legacy `severity` / `overall_verdict` /
  `defect_category` fields

## Failure found and fixed by this run

The first attempt embedded the raw 642KB PNG and AWS rejected CreateHIT:
`Your request contains too much data for QuestionXML. This parameter can have
a maximum length of 131072 characters.` Re-running with the 59KB
`-embed.jpg` succeeded. This produced two durable guards:

- client: `screenshotToVisualEvidence` fails fast when the data URL would
  exceed `MAX_VISUAL_DATA_URL_CHARS` (110,000 chars)
- bridge: `/dispatch` returns `400` before calling AWS when the rendered
  QuestionXML exceeds 131,072 chars

## Completing the loop

The HIT awaits a sandbox worker. Worker preview:
`https://workersandbox.mturk.com/projects/3XIWDYX973CHIROI2OXPXYKX1Y9Q1M/tasks`

After submitting as a worker, the bridge (`:3300`) polls every 15s, delivers
the callback, and the broker auto-advances a unanimous high-confidence pass.
Then, on Bux:

```bash
cd ~/Code/ai-human-review-broker-agent-loop
npm run -s review -- --resume job_6c7917d6-7a3e-455f-8467-dbaa375241d7 \
  --broker-url http://127.0.0.1:3200 --timeout-seconds 120
```

Exit `0` + `"agent_next_action": "pass"` completes the structured-template
phase of the loop (verdict math itself is already covered by the phase-6 pass
proof in `mturk-sandbox-e2e-proof.md`).
