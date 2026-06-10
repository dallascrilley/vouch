---
date: 2026-06-09
topic: surprise-me
focus: agent-selected from codebase (no user subject)
mode: repo-grounded
epic: td-2dab0a
proof: https://www.proofeditor.ai/d/0r5xcegc?token=ad0796e7-55cd-498c-a9f6-775a30c439b1
---

# Ideation: Human Review Broker — Surprise-Me Sweep

## Grounding Context

**Codebase:** TypeScript/Fastify HITL verification control plane. SQLite local runtime shipped; PostgreSQL/pg-boss/S3/OTel documented target not in `src/`. Provider integration (MTurk) with pass-callback auto-advance recently landed. Bottleneck shifted from dispatch to return-path + verdict semantics — unclear/fail callbacks still manual. MTurk bridge is staging hack; throttling on poll after delivery. Self-verification US1 stubs human-review escalation. In-memory metrics only.

**Past learnings:** Local validation authoritative (`npm run verify` dogfoods broker). Constitutional constraints: privacy gate fail-closed, provider-neutral core, consensus ≠ adjudication, machine-readable feedback, budget caps. No `docs/solutions/` yet. Doc drift: `verification-control-plane.md` stale vs SQLite reality.

**External:** White-space vs LangSmith/Braintrust/Toloka — unified release-gating control plane. Blinded quorum, pairwise escalation, policy-pinning, expert lane routing, prod-trace calibration flywheel.

**Recent activity:** MTurk sandbox E2E proof, auto-advance pass callbacks, provider test harness extraction, Docker/verify gate.

## Topic Axes

Decomposition skipped — surprise-me mode

## Ranked Ideas

### 1. Offline proof-bundle fixtures for return-path replay
**Description:** Freeze the MTurk sandbox E2E correlation chain (HIT → assignment → job → response → ledger) plus `.runtime/` SQLite/bridge-state snapshots into versioned fixtures that `provider-test-app` replays offline — no Bux, no AWS. Live sandbox becomes optional regression, not the gate for every provider change.
**Basis:** direct: `docs/ops/mturk-sandbox-e2e-proof.md`, `tests/helpers/provider-test-app.ts`, `scripts/verify-mturk-phase6-run.ts`; learnings: local validation is authoritative proof path
**Rationale:** Every future provider adapter proves the same receipt semantics once. Directly attacks split-brain Mac/Bux tax and makes return-path work testable on every dev machine.
**Downsides:** Fixture maintenance when contract shapes change; risk of fixtures diverging from live MTurk behavior.
**Confidence:** 88%
**Complexity:** Medium
**Status:** Implemented — [td-16ce66](https://github.com/DallasCrilleyMarTech/review-qa-broker/issues/4) (`tests/fixtures/provider-return-path/mturk-sandbox-pass-v1/`, `npm run validate:provider-proof-bundle`)

### 2. Automate ambiguous/fail return paths (pairwise + unanimous-fail auto-advance)
**Description:** Extend auto-advance beyond unanimous pass: (a) mirror for unanimous high-confidence fail; (b) for ambiguous/split signals, auto-spawn a cheaper pairwise tie-break micro-task before full rubric consensus. Unclear-only cases still escalate; pass-only shortcut no longer the only automated terminal path.
**Basis:** direct: `ProviderWorkflowService` pass-only gate; `docs/ops/provider-integration-proof.md` documents manual unclear/fail; external: LangSmith pairwise queues, Toloka policy-aware eval
**Rationale:** Goalplan Phases 1–3 bottleneck is post-callback orchestration, not dispatch. Symmetric automation unlocks agent-trustable verdicts for fail and disagreement without operator POST loops.
**Downsides:** Pairwise adds product surface; must preserve severe-minority and constitutional consensus/adjudication split for split verdicts.
**Confidence:** 82%
**Complexity:** High
**Status:** Unexplored — [td-469a69](https://github.com/DallasCrilleyMarTech/review-qa-broker/issues/5)

### 3. Stuck-state subscription API for non-auto-advance jobs
**Description:** Treat jobs that stall after provider callback (ambiguous/fail, budget-blocked, awaiting consensus) as first-class product surface: webhook or poll API returning `stuck_reason`, ledger slice, sanitized package hash, and recommended operator/agent next action — not ops debt hidden in runbooks.
**Basis:** direct: Bux runbook step 5 for ambiguous/fail; `provider-auto-advance.test.ts` unclear non-advance; goalplan return-path gap
**Rationale:** Return-path bottleneck is now human/operator latency. Agents commissioning verification need durable handles on unresolved evidence instead of polling or timing out.
**Downsides:** API design + retention policy; must not leak raw artifacts through subscription channel.
**Confidence:** 80%
**Complexity:** Medium
**Status:** Unexplored — [td-3d107c](https://github.com/DallasCrilleyMarTech/review-qa-broker/issues/6)

### 4. Distinct ledger events for auto-advance (end synthetic democracy)
**Description:** Stop writing fake quorum consensus/adjudication records on single-worker auto-advance. Introduce explicit ledger event types (e.g. `provider_auto_resolved`) with honest metadata (`validResponseCount: 1`, no fabricated `disagreementLevel: low`). Audit trail distinguishes synthetic resolution from real human quorum.
**Basis:** direct: `src/domain/human-review/provider-workflow-service.ts` auto-advance path fabricates quorum; `docs/ops/mturk-sandbox-e2e-proof.md` feedback shape with polluted `retry_reason` on pass
**Rationale:** Release gating and compliance narratives assume ledger reflects actual human process. Honest events also fix agent confusion from `retry_reason` on terminal pass.
**Downsides:** Breaking change for consumers expecting current ledger shape; migration for inspection API consumers.
**Confidence:** 85%
**Complexity:** Low–Medium
**Status:** Implemented — [td-d75997](https://github.com/DallasCrilleyMarTech/review-qa-broker/issues/7) (`verification.provider.auto_resolved` ledger; no synthetic consensus/adjudication; `retry_reason: null` on pass)

### 5. Bridge delivery-complete + poll backoff after callback
**Description:** After first successful callback ingestion, bridge sets `delivery_complete: true` and stops aggressive `list-assignments-for-hit` polling. Add structured backoff on throttle. Expose bridge health surface: last poll, delivery lag, throttle events, dead-letter count — provider-agnostic schema seeding bridge-common extraction.
**Basis:** direct: `docs/ops/mturk-sandbox-e2e-proof.md` ThrottlingException post-delivery; goalplan Phase 4 operational controls; `verify-mturk-phase6-run.ts` stale-bridge fallback
**Rationale:** Staging bridge creates false "broken" signals after jobs already reached `final_pass`. Hardening here is prerequisite before second provider, not per-provider runbook duplication.
**Downsides:** Edge cases if late assignments arrive; must reconcile with broker dedupe by `payloadHash`.
**Confidence:** 83%
**Complexity:** Medium
**Status:** Unexplored — [td-0836d0](https://github.com/DallasCrilleyMarTech/review-qa-broker/issues/8)

### 6. Self-verification escalates to real human package (replace US1 stub)
**Description:** When `npm run verify` dogfood hits `human_review` or `internal_review`, broker blocks completion and auto-dispatches minimal sanitized human package (failing criterion + redacted diff) instead of returning `retry` with "Human review queueing not implemented in US1". Agent receives verdict only after provider return or budget fail-closed.
**Basis:** direct: `src/domain/self-verification/self-verification-service.ts` stub; goalplan Phase 6 agent-usable autonomous self-verification; `broker-gate.ts` release gate path
**Rationale:** US1 is the front door for agent commissioning. Stub trains wrong agent behavior and disconnects self-verification from the HITL path the product exists to provide.
**Downsides:** Increases verify run cost/latency; needs local sim provider path for dev without Bux.
**Confidence:** 78%
**Complexity:** High
**Status:** Unexplored — [td-7b1115](https://github.com/DallasCrilleyMarTech/review-qa-broker/issues/9)

### 7. Signed verdict export as org release gate
**Description:** Export `broker-gate` verdict schema as consumable release artifact: signed JSON with `release_gate_effect`, `job_id`, ledger attestation. CI/policy service blocks merge on `block` without re-running tests. Positions broker as verification control plane boundary, not internal test harness.
**Basis:** direct: `broker-gate.ts` `release_gate_effect`; `npm run verify` dogfood path; external: release-gating white-space vs eval platforms
**Rationale:** Product differentiation is unified auto-verify → policy → privacy → human → verdict → agent feedback. Making verify output org-consumable closes the loop for agent-native workflows.
**Downsides:** Signature/key management; org adoption friction; must not bypass constitutional privacy on artifact export.
**Confidence:** 75%
**Complexity:** Medium
**Status:** Unexplored — [td-17195c](https://github.com/DallasCrilleyMarTech/review-qa-broker/issues/10)

## Rejection Summary

| # | Idea | Reason Rejected |
|---|------|-----------------|
| 1 | Cross-domain metaphors (diplomatic pouch, mycorrhizal, whaling, etc.) | Not actionable — reframes existing features without new behavior |
| 2 | Privacy gate publish-first CDN | Violates constitutional fail-closed externalization |
| 3 | MTurk constitutional monopoly | Violates provider-neutral constraint |
| 4 | Human-first default (agents escalate to machines) | Product identity inversion — brainstorm variant |
| 5 | Zero-budget adversarial lottery | Stress-test thought experiment, not shippable |
| 6 | SQLite-at-scale production topology | High burden, fights documented prod target |
| 7 | NIST RMF evidence pack | Enterprise packaging premature vs core loop gaps |
| 8 | Anti-benchmark feedback schema | Positioning constraint, low near-term leverage |
| 9 | Verdict lease | Overlaps stuck-state; high complexity for current stage |
| 10 | Constitutional doc drift CI check | Tactical doc fix, below ambition floor |
| 11 | Bridgeless signed webhooks only | Subsumed by bridge-common + fixtures path |
| 12 | Budget-triggered escalation downgrade | Complex policy before basic return-path works |
| 13 | Calibration metrics persistence | Valid but secondary to return-path + fixtures |
| 14 | Split-brain Bux/Mac tax (standalone) | Partially mitigated by proof-bundle fixtures (#1) |
