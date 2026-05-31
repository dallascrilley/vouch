# Verification Control Plane Policies

## Externalization

- Public crowd review is limited to `public` evidence with completed redaction.
- Sensitive internal evidence may route to internal or managed reviewers.
- Regulated, secret, or failed-redaction evidence fails closed unless an internal-only path is explicitly approved.
- Billing routes stay internal.

## Budgets

- Default per-job cap: `25`
- Default assignment cap: `3`
- Default retry cap: `2`
- Release-gating overrides tighten retries and raise per-job cap for priority handling.

## Provider Routing

- Preferred providers are used when healthy.
- Healthy fallback providers are selected before degraded ones.
- Down providers are skipped.

## Retention

- Raw artifacts: `30` days
- Sanitized packages: `14` days
- Reviewer responses: `90` days
- Aggregate metrics: `365` days
