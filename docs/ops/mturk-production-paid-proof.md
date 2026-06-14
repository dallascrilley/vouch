# MTurk production paid proof

Real-money production HIT round-trip completed on Bux on 2026-06-14: dispatch,
anonymous worker submit, bridge callback, auto-approve, broker `pass` verdict,
`validate:mturk-phase6` verified.

Stack during proof: `~/Code/ai-human-review-broker-agent-loop`, broker
`:3200`, prod bridge `:3300` with `env.production` overlay. **Current Bux
default** (post-proof): sandbox bridge on `:3300` — see Post-proof ops below.

## Funding finding

Signup credit is `$0.02`. Template default reward `$0.10` fails
`create-hit` with insufficient funds. `$0.01` reward + fee fits the balance.
Monthly Service Quota `L-EC45676A` = `$2500` on account `181596276354`.

## Guard rehearsal

Prod endpoint without `MTURK_ALLOW_PRODUCTION` refuses at bridge startup:

```text
Unsafe MTurk bridge configuration: MTURK_AWS_ENDPOINT_URL https://mturk-requester.us-east-1.amazonaws.com is a production endpoint; paid HITs require MTURK_ALLOW_PRODUCTION=true
```

## Cost preview (`--reward 0.01`)

```json
{
  "estimated_cost_usd": 0.02,
  "pricing": { "max_assignments": 1, "reward": "0.01" }
}
```

## Balance

| When | `AvailableBalance` |
|------|---------------------|
| Before dispatch | `$0.02` |
| After dispatch | `$0.00` (reserved against live HIT) |
| After approval | `$0.00` (reward + fee charged from signup credit) |

Net delta: `-$0.02` from pre-dispatch balance.

## Correlation IDs

| Field | Value |
|-------|-------|
| Job ID | `job_d041716d-d401-4072-893a-77a3e74c0c91` |
| HIT ID | `39XCQ6V3KZ5460XYVAI2K0Z91LW56L` |
| Review task ID | `review_64afcfa3-9ce3-4654-933d-5578d6bf81bb` |
| Assignment ID | `336KAV9KYRTGD7MB9CGXU4DS6142YH` |
| Worker ID | `A24MJRN4XC71CI` (anonymous crowd; not sandbox worker) |
| Reward | `$0.01` |
| Criterion | `hero-cta-no-overlap` |
| Bridge state | `.runtime/mturk-bridge-state-production.json` |

## Dispatch command

```bash
npm run -s review -- \
  --template binary_screenshot_check \
  --question "hero-cta-no-overlap:The orange Commission review CTA is below the hero headline and does not overlap it." \
  --screenshot .runtime/hero-embed.jpg \
  --caption "Hero section at 1440x900" --viewport 1440x900 \
  --risk low --reward 0.01 --no-wait \
  --broker-url http://127.0.0.1:3200
```

## Resume (worker submitted)

```bash
npm run -s review -- --resume job_d041716d-d401-4072-893a-77a3e74c0c91 \
  --broker-url http://127.0.0.1:3200 --wait
```

Exit **0**. CLI summary:

```json
{
  "final_verdict": "pass",
  "agent_next_action": "pass",
  "provider_response_ids": ["336KAV9KYRTGD7MB9CGXU4DS6142YH"]
}
```

## HIT / assignment (final)

| Field | Value |
|-------|-------|
| HIT status | `Reviewable` (`Completed: 1`) |
| Assignment status | `Approved` |
| Bridge delivery | `deliveryComplete: true` at `2026-06-14T06:48:53.346Z` |
| Delivery lag | `7346` ms |
| Worker answer | `criterion_0_answer: yes`, confidence `high` |

Broker feedback (`GET /verification-jobs/.../feedback`):

```json
{
  "final_verdict": "pass",
  "agent_next_action": "pass",
  "failed_criteria": [],
  "provider_response_ids": ["336KAV9KYRTGD7MB9CGXU4DS6142YH"],
  "human_annotations": ["336KAV9KYRTGD7MB9CGXU4DS6142YH"],
  "retry_allowed": false,
  "policy_constraints": ["provider_auto_resolved"]
}
```

## Phase 6 verification

On Bux with prod endpoint and IDs above:

```bash
export BROKER_BASE_URL=http://127.0.0.1:3200
export MTURK_BRIDGE_BASE_URL=http://127.0.0.1:3300
export MTURK_AWS_ENDPOINT_URL=https://mturk-requester.us-east-1.amazonaws.com
export PHASE6_HIT_ID=39XCQ6V3KZ5460XYVAI2K0Z91LW56L
export PHASE6_JOB_ID=job_d041716d-d401-4072-893a-77a3e74c0c91
export PHASE6_REVIEW_TASK_ID=review_64afcfa3-9ce3-4654-933d-5578d6bf81bb
export EXPECTED_AGENT_NEXT_ACTION=pass
# MTURK_BRIDGE_API_KEY from .env
npm run -s validate:mturk-phase6
```

Result: `"status": "verified"` (exit 0).

## U7 regression (Bux)

`npm run validate:provider-e2e` → exit 0, `status: simulated provider e2e passed`.

Sandbox-profile bridge starts on alt port with sandbox endpoint (no
`MTURK_ALLOW_PRODUCTION`).

**Post-proof ops (2026-06-14):** Bux `:3300` restored to sandbox default
(sandbox state file, `$0` prod balance). Prod overlay preserved in
`env.production` for future funded runs.

## Checklist (U3–U6)

- [x] Prod requester linked; micro-credit dispatch path
- [x] Production guard + cost estimate
- [x] Paid HIT dispatched from Bux
- [x] Anonymous worker submit + bridge delivery + approval
- [x] Broker verdict + CLI feedback
- [x] Ending balance recorded
- [x] `validate:mturk-phase6` verified
- [x] Simulated provider regression green
