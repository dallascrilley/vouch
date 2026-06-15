# Residual review / deferred verification — feat/whats-next-finish-2026-06-14

## Open td items (human or environment gated)

| td | Item | Reason deferred |
|----|------|-----------------|
| td-bfabca | Live Bux ambiguous sandbox proof | Requires operator worker submit on `bux-cmd`; runbook prepped in `docs/ops/bux-mturk-runbook.md` |
| td-9083c8 | Docker smoke verification | `script/validate-docker-smoke` committed; Docker daemon unavailable in agent execution environment |

## Verification completed in branch

- `npm test` — 173 passed
- `npm run validate:agent-loop` — exit 0
- `npm run validate:provider-e2e` — exit 0
- `npm run validate:provider-proof-bundle -- mturk-sandbox-ambiguous-v1` — offline ambiguous path
