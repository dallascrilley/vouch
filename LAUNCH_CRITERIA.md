# Launch criteria — Vouch (quorum-private)

Parseable contract for pinned-fleet ingest. Narrative authority remains
[`README.md`](README.md).

Persona: an autonomous agent that needs a human verdict on something
machines cannot settle.
Core path: POST a verification job → privacy gate → self-verification →
human review → consensus → machine-readable next action.

## Measurement (2026-08-17)

Ran on pin MAIN `0d3aeeb` with existing `node_modules` only. No `npm ci`,
no Docker, no live MTurk. MAIN stayed clean.

- `npm run validate:agent-loop` → `agent_next_action: pass`,
  `status: agent loop validation passed`
- `npm run validate:local-runtime` → `local runtime validation passed`
- `npm run validate:provider-e2e` → `status: simulated provider e2e passed`,
  `final_verdict: pass`
- `npm run validate:provider-proof-bundle` →
  `status: provider proof-bundle replay passed` (ambiguous/fail/pass bundles)
- `npm run validate:pi-extension` →
  `status: pi extension validation passed`, `simulated: true`

Did not run `npm test`, `docker build`, or live crowd. V7 stays planned
until a container run is measured. Live crowd and repo rename stay holds.

- id: V1
  feature: Offline agent-loop harness returns an actionable verdict
  status: met
- id: V2
  feature: Four offline harnesses passed on current HEAD (local-runtime, provider-e2e, proof-bundle, agent-loop)
  status: met
- id: V3
  feature: Privacy gate fails closed on secret, regulated, or failed-redaction evidence
  status: met
- id: V4
  feature: OpenAPI and event contracts are checked by the contract suite
  status: met
- id: V5
  feature: Agent CLI can commission a review and wait for a verdict
  status: met
- id: V6
  feature: Pi extension exposes human_review against a loopback broker
  status: met
- id: V7
  feature: Container image runs the self-hosted broker
  status: planned
- id: V8
  feature: This repository has a parseable launch contract
  status: met
- id: live-crowd
  feature: Live crowd-provider review stays an operator AWS/MTurk walkthrough
  status: hold
- id: repo-rename
  feature: GitHub remote rename from quorum-private to the Vouch name stays operator-owned
  status: hold
