# MTurk production paid proof (in progress)

Real-money production HIT dispatched from Bux on 2026-06-14. Worker submission
and broker verdict pending (qualifications require ≥95% approval and ≥100
approved HITs — anonymous crowd only).

Stack: `~/Code/ai-human-review-broker-agent-loop`, broker `:3200`, prod bridge
`:3300` with `env.production` overlay.

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
| After dispatch | `$0.00` (reserved against live HIT; releases if HIT expires unassigned) |

## Correlation IDs (dispatch)

| Field | Value |
|-------|-------|
| Job ID | `job_d041716d-d401-4072-893a-77a3e74c0c91` |
| HIT ID | `39XCQ6V3KZ5460XYVAI2K0Z91LW56L` |
| Review task ID | `review_64afcfa3-9ce3-4654-933d-5578d6bf81bb` |
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

## Resume (when worker submits)

```bash
npm run -s review -- --resume job_d041716d-d401-4072-893a-77a3e74c0c91 \
  --broker-url http://127.0.0.1:3200 --wait
```

## Still open

- [ ] Anonymous worker assignment + bridge delivery
- [ ] Broker verdict + CLI feedback JSON
- [ ] Ending balance delta (reward + 20% fee)
- [ ] `validate:mturk-phase6` with new IDs → `"status": "verified"`
