• Plan

  The current bottleneck is no longer dispatch. It is proving the full return path from a real
  worker submission back into broker state, then tightening the loop until an agent could rely
  on it autonomously.

  Phase 1: Complete the first truthful E2E receipt

  1. Submit 1-2 of the existing sandbox HITs as a worker.
     Use one clear pass case and one ambiguous or fail case if possible.

  2. Verify MTurk-side submission exists.
     On Bux, run aws mturk list-assignments-for-hit for the submitted HIT IDs.

  3. Verify bridge ingestion.
     From the mturk-staging worktree:
     - `curl -sf -H "authorization: Bearer $MTURK_BRIDGE_API_KEY" http://127.0.0.1:3100/state`
     - inspect `.runtime/mturk-bridge-state.json` for `lastPollAt`, `lastDeliveryAt`, and
       `deliveredAssignmentIds`
     Bridge stdout (Fastify logger) should show poll + callback POST success for the assignment.

  4. Verify broker state mutation.
     Inspect GET /runtime/inspection/jobs/:jobId and confirm:
      - review_tasks[].state moved beyond pure dispatch
      - a normalized human response exists
      - ledger reflects the response transition

  5. Capture a durable proof bundle.
     Save the exact HIT ID, assignment ID, job ID, inspection output, and relevant log lines
     into docs/ops/ or a dedicated proof note.

  Acceptance for Phase 1

  - At least one real sandbox assignment is submitted.
  - The bridge polls it and posts a normalized callback successfully.
  - Broker inspection shows response evidence, not just dispatched task state.

  Phase 2: Drive downstream verdict behavior

  1. For the ingested job, exercise the next state transition intentionally.
     If the system does not auto-run consensus/adjudication yet, post the contract payloads
     manually.

  2. Verify consensus/adjudication behavior matches the worker response.
     Use one case that should resolve cleanly and one that should trigger retry/adjudication
     semantics.

  3. Verify GET /verification-jobs/:jobId/verdict and /feedback.
     Confirm machine-readable fields are useful to an agent, not just a human operator.

  4. Record the minimum operator playbook for a real review cycle.
     Dispatch -> worker submit -> ingestion -> verdict -> feedback.

  Acceptance for Phase 2

  - One job reaches a truthful post-response outcome.
  - Verdict and feedback surfaces are populated and inspectable.
  - The result is specific enough that an agent could act on it.

  Phase 3: Remove manual glue in the loop

  1. Decide what should be automatic after ingestion.
     The likely target is: callback ingestion should enqueue or trigger consensus policy
     evaluation rather than requiring manual POSTs.

  2. Implement the smallest automation gap.
     Do not redesign the whole broker. Add the narrow orchestration needed so response arrival
     advances the workflow.

  3. Add regression coverage for that orchestration.
     Cover at least:
      - provider response received
      - automatic next-step transition
      - correct verdict/feedback population for the happy path

  4. Re-run local tests and one real sandbox submission after the change.

  Acceptance for Phase 3

  - A real provider response advances the job without manual contract pokes for the core path.
  - Tests pin the orchestration behavior.

  Phase 4: Harden MTurk as a supported provider lane

  1. Promote the bridge from “staging hack” to explicit provider integration surface.
     Document it as a supported adapter pattern, with clear boundaries.

  2. Add operational controls:
      - poll interval/backoff
      - duplicate assignment handling
      - dead-letter/error visibility
      - structured logs for HIT/assignment/job correlation

  3. Add MTurk-specific safety controls:
      - max spend caps
      - assignment approval policy
      - timeout/expiration handling
      - worker qualification strategy if needed

  4. Add restart/recovery proof.
     Restart broker and bridge with active HITs and verify no mapping or receipt loss.

  Acceptance for Phase 4

  - MTurk path is restart-safe, observable, and bounded by policy.
  - Operators can trace HIT -> assignment -> callback -> job.

  Phase 5: Generalize to “MTurk and similar providers”

  1. Freeze the provider contract that the broker expects.
     The current bridge shape is close: dispatch, poll/callback, normalize.

  2. Extract bridge-common behavior from MTurk-specific behavior.
     Shared:
      - task mapping
      - normalization target schema
      - callback delivery
      - receipt dedupe
        Provider-specific:

      - task creation API
      - answer parsing
      - auth/config

  3. Define a second provider bridge prototype.
     Even a mock second provider is useful to prove the abstraction.

  4. Ensure broker core does not need per-provider branching beyond config/capability
     declarations.

  Acceptance for Phase 5

  - Adding a second provider does not require changing job/privacy/verdict/feedback concepts.
  - Provider-specific code is isolated to the bridge/adapter layer.

  Phase 6: Make it agent-usable for autonomous self-verification

  1. Define the agent-facing commissioning contract.
     An agent should be able to request a review with:
      - criteria
      - evidence package
      - risk/privacy class
      - budget/deadline
      - desired reviewer pool/provider policy

  2. Define the completion contract back to the agent.
     The feedback must tell the agent what to do next:
      - pass
      - fail
      - retry
      - recapture
      - escalate

  3. Add one end-to-end agent simulation test.
     Agent submits ambiguous evidence -> broker routes to MTurk -> worker response ingested ->
     feedback returned -> agent decision is unambiguous.

  4. Only after that, consider productionizing beyond sandbox.

  Acceptance for Phase 6

  - An agent can commission review and consume the result without human interpretation.
  - The feedback loop is good enough for autonomous retry/self-verification decisions.

  Recommended immediate order

  1. ~~Complete one real worker submission on the existing HITs.~~ **Done** — see proof below.
  2. ~~Verify ingestion and capture proof.~~ **Done** — 2026-06-08 receipt captured.
  3. ~~Manually drive verdict/feedback once, if necessary.~~ **Done for pass case** on job below.
  4. ~~Automate the post-ingestion transition (Phase 3).~~ **Done** — `ProviderWorkflowService`, `auto_advanced` on pass callbacks, `provider-auto-advance.test.ts`, `npm run validate:provider-e2e`.
  5. ~~Re-run live sandbox proof after broker/bridge restart~~ **Done on Mac** — AWS list step still on Bux (`npm run validate:mturk-phase6`).
  6. Then harden MTurk operationally.
  7. Then generalize to additional providers.

  ## Progress (2026-06-09)

  Phase 1 receipt exists in the mturk-staging worktree runtime DB:

  - Proof doc (main): `docs/ops/mturk-sandbox-e2e-proof.md` (synced from mturk-staging worktree)
  - Job: `job_fa7b9778-cfe6-4e54-9374-d6d0140f67ee`
  - HIT: `3EGKVCRQFXT8E0OD232RVG7ISQDBY7`
  - Assignment: `39DD6S19JQC8DD8WYIB2ZFIKGVUEZ7`
  - Outcome: worker pass → callback → `agent_next_action: pass`

  Broker/bridge live re-verified on 2026-06-09 (inspection/verdict/feedback + bridge `/state`).
  `validate:mturk-phase6` still needs Bux AWS creds (`AWS.AccountNotLinked` on Mac).

  What I would do next

  1. Org admin: enable GitHub Actions for `DallasCrilleyMarTech` (repo currently `enabled: false`).
  2. On Bux: run `npm run validate:mturk-phase6` for pass proof job; submit ambiguous/fail sandbox HIT per `docs/ops/bux-mturk-runbook.md`.