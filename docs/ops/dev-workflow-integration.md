# Dev-Workflow Integration

The broker can gate its own (or any) repository's changes. Quality checks become
broker **acceptance criteria**, their pass/fail outcomes drive the
**self-verification** lifecycle, and the resulting **verdict** decides whether
the change is allowed to merge — while leaving a durable verdict + machine-
readable feedback record behind.

This is the AI-only path (no human reviewers). Human review can be layered on
later for high-risk changes without changing the call sites below.

## The gate

```bash
npm run verify            # runs lint + build + test, then asks the broker for a verdict
npm run verify lint test  # run a subset of checks
```

`scripts/verify-change.ts` runs each check, maps it to an acceptance criterion,
and posts results through the lifecycle:

```
POST /verification-jobs                              create job (criteria declared here)
POST /verification-jobs/:id/artifacts                check output recorded as evidence
POST /verification-jobs/:id/privacy-classification   internal_low / internal_only
POST /verification-jobs/:id/self-verification-results pass|fail derived from exit codes
GET  /verification-jobs/:id/verdict                  release_gate_effect: allow | block
GET  /verification-jobs/:id/feedback                 failed criteria + repair hints
```

The process exits `0` only when `release_gate_effect == "allow"` (a `pass`
verdict). Any other verdict — `fail`, `retry`, `recapture`, `fail_closed` —
blocks with exit `1`.

## Two transports, one code path

`scripts/lib/broker-gate.ts` exposes `BrokerClient.connect()`:

- **In-process (default).** Builds the app in-memory over SQLite — zero infra.
  Set `RUNTIME_SQLITE_PATH` to keep a durable verdict ledger; otherwise an
  ephemeral temp database is used and cleaned up. This is what runs locally and
  in CI today.
- **HTTP.** Set `BROKER_URL=https://broker.internal` to record verdicts in a
  deployed broker shared across the team/CI. `RUNTIME_OPERATOR_TOKEN` is sent as
  `x-operator-token` for any operator-scoped calls.

```bash
BROKER_URL=https://broker.internal npm run verify
```

## CI

`.github/workflows/ci.yml` runs `npm run verify` as the quality gate. The broker
verdict is the merge signal; the verdict/feedback ledger is the audit trail.

## Local pre-push (optional)

```bash
# .git/hooks/pre-push
#!/bin/sh
npm run verify || { echo "broker gate blocked the push"; exit 1; }
```

## Extending it

- **More checks:** add to the `CHECKS` array in `scripts/verify-change.ts`
  (id, criticality, command). Criticality flows into the broker as criterion
  criticality.
- **Higher-risk routing:** raise `risk_tier` in `runSelfVerificationGate` and
  add human-review tasks (`POST /verification-jobs/:id/human-review-tasks`)
  before reading the verdict — the rest of the gate is unchanged.
- **Agent-in-the-loop:** any AI agent can call `BrokerClient` directly to submit
  its own output, get a verdict, and act on the machine-readable feedback.
