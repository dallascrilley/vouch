# Quickstart: Verification Control Plane

This quickstart defines the implementation path for the planned MVP. It is intentionally contract-first and stops before provider-specific production dispatch.

## 1. Establish Project Skeleton

Create the service structure from `plan.md`:

```text
src/api
src/domain
src/adapters
src/workers
src/config
tests/contract
tests/integration
tests/unit
```

Add TypeScript project tooling, Fastify, Ajv validation, OpenAPI validation, PostgreSQL access, pg-boss workers, S3-compatible object storage access, Pino logging, OpenTelemetry instrumentation, formatting, linting, and a test runner in the first implementation task.

## 2. Lock Contracts Before Behavior

Validate these design artifacts before writing lifecycle behavior:

- `contracts/openapi.yaml`
- `contracts/events.md`
- `data-model.md`

Minimum checks:

- OpenAPI parses and all referenced schemas resolve.
- Event names are unique and every lifecycle transition in `data-model.md` has a ledger event.
- No contract field exposes hidden agent reasoning, raw secrets, raw logs, raw network payloads, or customer data to human reviewers.

## 3. Implement Domain Models and State Machine

Implement core models first:

- `VerificationJob`
- `AcceptanceCriterion`
- `ArtifactManifest`
- `PrivacyClassification`
- `SelfVerificationResult`
- `HumanReviewTask`
- `HumanResponse`
- `ConsensusResult`
- `AdjudicationCase`
- `FinalVerdict`
- `AgentFeedbackSignal`
- `VerdictLedgerEvent`

Required unit tests:

- Duplicate idempotency key returns the existing active job.
- Critical criteria cannot pass without required evidence mapping.
- Invalid lifecycle transitions are rejected.
- Every state transition emits a ledger event.

## 4. Build Privacy Gate Before Review Dispatch

Implement classification, redaction status, reviewer-route selection, and fail-closed behavior before any provider adapter.

Required tests:

- Public low-risk sanitized evidence can route to public review.
- Sensitive internal evidence routes only to internal or managed review.
- Regulated, secret, customer, or redaction-failed evidence blocks public review.
- Missing approved route results in fail-closed or recapture according to policy.

## 5. Add Self-Verification and Escalation Policy

Implement automated result ingestion and decision policy:

- high-confidence pass
- high-confidence fail
- retry
- recapture
- external human review
- internal/managed review
- fail closed

Required tests:

- Blank/loading/cropped artifacts request recapture.
- Critical deterministic failure cannot be converted into pass by public review.
- Medium confidence with safe evidence routes to human review.
- Sensitive uncertainty routes internally or fails closed.

## 6. Add Internal Human Review First

Create the human review task and response path with an internal reviewer pool before public provider dispatch.

Required tests:

- Human task packages reference only sanitized package IDs.
- Required response fields are enforced.
- Contradictory responses are rejected or downweighted.
- Disagreement after quorum triggers more review or adjudication.

## 7. Add First Public Provider Adapter

Add one low-risk public provider adapter behind `ProviderCapabilityProfile`.

Adapter tests must prove:

- Core job/task/response/verdict models do not contain provider-specific semantics.
- Provider IDs are stored only as adapter references.
- Cost estimation respects job and daily caps.
- Provider failure falls back, retries, or blocks according to policy.

## 8. Verify Feedback and Ledger

End-to-end integration scenario:

1. Create a job with observable criteria and synthetic evidence.
2. Attach artifact manifest.
3. Classify privacy as low-risk and redacted.
4. Record medium-confidence self-verification.
5. Queue internal or public human review.
6. Ingest three structured responses.
7. Produce consensus.
8. Finalize verdict.
9. Emit agent feedback.
10. Query ledger and confirm every transition is traceable.

Expected result:

- final verdict is machine-readable
- failed criteria and evidence pointers are present when applicable
- budget state is included
- release-gate effect is explicit
- operator can trace all decisions from source evidence to final feedback
