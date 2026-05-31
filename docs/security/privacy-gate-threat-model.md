# Privacy Gate Threat Model

## Primary Risks

- Raw screenshots, DOM snapshots, or logs leaking to public reviewers
- Misrouting sensitive evidence to the public crowd
- Budget exhaustion causing silent behavior changes
- Human-review disagreement masking severe issues
- Provider outages causing stale or partial review states

## Current Controls

- Externalization policy blocks regulated or failed-redaction evidence
- Public crowd routing is limited to safe public evidence
- Billing routes require internal review
- Ledger records privacy decisions, state transitions, and budget-blocked events
- Consensus requires at least one recorded human response
- Adjudication remains a separate path for disputed or severe cases

## Residual Gaps

- Real redaction transforms are still represented by policy state, not artifact mutation
- Durable storage and provider callbacks are still in-memory substitutes
- Alerting and dashboards are not yet wired to a runtime backend
