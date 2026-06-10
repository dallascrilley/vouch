# `npm run review --wait` polls forever in local simulated mode

**Symptom.** A review commissioned via `npm run review -- ... --wait` against a
local broker (`npm run dev`) never returns; the job sits in
`human_responses_received` with one valid simulated response recorded, no
`final_verdicts` row, and the CLI exits 5 (timeout) after 30 minutes.

**Root causes (two, both in `src/workers/index.ts`).**

1. The queue worker recorded the simulated response
   (`dispatchLocalProviderTask`) but never called
   `providerWorkflowService.maybeAutoAdvanceAfterIngest`, unlike the two
   route-based sim paths (`src/api/routes/evidence.ts`,
   `src/api/routes/provider-callback.ts`). So queue-dispatched jobs never
   reached consensus/verdict.
2. The idle-poll `sleep` used an unref'd timer, leaving the event loop empty
   between polls — Node exited the "long-lived" worker process the moment the
   queue drained. Every worker launch looked like a clean instant exit (code 0),
   which masquerades as "started fine".

**Fix.** Worker now calls `maybeAutoAdvanceAfterIngest` after each simulated
dispatch (both `startWorkers` and `runWorkerLoop`), and the sleep timer stays
ref'd. `npm run dev:worker` runs the worker from source.

**How to verify.** `npm run dev` + `npm run dev:worker`, then
`npm run review -- --template binary_screenshot_check --question "id:stmt" --screenshot x.jpg --risk medium --wait`
returns exit 0 with `"agent_next_action": "pass"` within ~20s.

**Gotcha while debugging.** If an old worker process is still running, it can
claim the queue item with stale code and the job parks again — kill stray
workers (`pgrep -fl "workers/index"`) before concluding the fix doesn't work.
