# Launch criteria — Vouch (quorum-private)

Parseable contract for pinned-fleet ingest. Narrative authority remains
[`README.md`](README.md).

Persona: an autonomous agent that needs a human verdict on something
machines cannot settle.
Core path: POST a verification job → privacy gate → self-verification →
human review → consensus → machine-readable next action.

- id: V1
  feature: Offline agent-loop harness returns an actionable verdict
  status: met
- id: V2
  feature: Four offline harnesses exist (local-runtime, provider-e2e, proof-bundle, agent-loop)
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
  status: met
- id: V8
  feature: This repository has a parseable launch contract
  status: met
- id: live-crowd
  feature: Live crowd-provider review stays an operator AWS/MTurk walkthrough
  status: hold
- id: repo-rename
  feature: GitHub remote rename from quorum-private to the Vouch name stays operator-owned
  status: hold
