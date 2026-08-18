# Privacy Gate

The privacy gate decides whether evidence may leave the broker. Client-supplied
`externalization_decision` is not authoritative. The server rewrites fail-closed
classifications, then re-evaluates policy at dispatch for the concrete reviewer
pool.

## Intent

- Keep raw screenshots, DOM, and logs off the public crowd unless policy allows.
- Fail closed on secret, regulated, or unsuccessful redaction.
- Make agent externalization a server-held go-live grant, not a field the agent
  can assert.

## Classification flow

1. Attach an artifact manifest (`POST /verification-jobs/:jobId/artifacts`).
   Classification without a persisted manifest, or with a mismatched
   `artifact_manifest_id`, is rejected.
2. `POST /verification-jobs/:jobId/privacy-classification` calls
   `PrivacyGate.record`.
3. `enforceServerSideDecision` may overwrite `data_class` and
   `externalization_decision`.
4. A `blocked_fail_closed` decision emits a terminal `fail_closed` verdict and
   feedback with `retry_allowed: false`.
5. Later dispatch calls `assertProviderDispatchAllowed`, which **recomputes**
   `evaluateExternalizationPolicy` for the reviewer pool being used. A stored
   client decision is not enough.

## Policy (`evaluateExternalizationPolicy`)

| Condition                                                        | Result                    |
| ---------------------------------------------------------------- | ------------------------- |
| `redaction_status` is `failed` or `insufficient_confidence`      | `blocked_fail_closed`     |
| `data_class` is `regulated_or_secret` and pool is not `internal` | `blocked_fail_closed`     |
| `data_class` is `sensitive_internal` and pool is `public_crowd`  | `managed_only` (blocked)  |
| route starts with `/billing` and pool is not `internal`          | `internal_only` (blocked) |
| otherwise                                                        | `allowed`                 |

Failed redaction is forced fail-closed even when the client sends
`externalization_decision: allowed`.

## Agent externalization grant

`PrivacyGate` takes `agentExternalizationEnabled`:

```text
localProviderMode === "disabled"  OR  PROVIDER_ENABLED !== "true"
```

- Demo / simulated path (`PROVIDER_ENABLED` not `true`): grant is on, but
  reviews stay simulated and do not cross a live crowd boundary.
- Real provider with default `LOCAL_PROVIDER_MODE=simulated`: grant is **off**.
  Jobs with `agent_run_id` that request a non-internal pool fail closed
  (`agent externalization requires the server-held go-live grant`).
- Pi go-live writes `LOCAL_PROVIDER_MODE=disabled` and `PROVIDER_ENABLED=true`,
  which turns the grant on.

Jobs whose `source.repository` is `pi-extension` and that request external
review without `agent_run_id` also fail closed.

## Health proof

Managed supervisors (Pi broker, MTurk bridge) probe `GET /health` with
`x-health-challenge`. The body is:

```json
{
  "broker_version": "vouch-broker-v1",
  "health_proof": "<base64url HMAC>",
  "local_provider_mode": "simulated",
  "status": "ok"
}
```

`health_proof` is HMAC-SHA256 of `health:v1:<challenge>` keyed by
`RUNTIME_OPERATOR_TOKEN` (`src/domain/privacy/health-proof.ts`). The challenge
path does not return `database_path`. The full health document still requires
`x-operator-token` when that token is configured.

## Pitfalls

- Honest `--data-class` on the CLI still matters, but the gate will block
  restricted classes even if the client asks for `allowed`.
- `allowed_reviewer_routes` must include the dispatch pool **and** the
  recomputed policy must allow that pool.
- Enabling `PROVIDER_ENABLED=true` without `LOCAL_PROVIDER_MODE=disabled`
  blocks agent external review. Use `/vouch-go-live` rather than toggling one
  variable.
- Redaction is still a policy flag, not an artifact transform. Do not claim
  pixels were stripped unless a sanitizer actually ran.

Code: `src/domain/privacy/privacy-gate.ts`,
`src/domain/privacy/externalization-policy.ts`,
`src/domain/privacy/health-proof.ts`.
