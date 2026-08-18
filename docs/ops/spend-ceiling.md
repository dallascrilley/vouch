# Spend ceiling

Real-provider dispatch can take a hard cumulative cost bound. The bound is
opt-in. Unset, the broker does not reserve spend. Set, a dispatch that would
exceed the cap fails closed and does **not** fall back to a simulated verdict.

## Environment

| Variable                       | Default        | Constraint                                              |
| ------------------------------ | -------------- | ------------------------------------------------------- |
| `VOUCH_REAL_SPEND_CEILING_USD` | unset (no cap) | If set, must be a finite number `> 0` or startup throws |

Pi `/vouch-go-live` writes this into `~/.vouch/pi/live.env`. Docker and
`npm run dev` must set it themselves for a live crowd path.

## How a reservation is computed

`parseDispatchPricing` reads the human-review `task_template` JSON:

```json
{
  "v": 1,
  "pricing": { "reward": "0.08", "max_assignments": 3 }
}
```

Estimated cost is `reward * max_assignments`, rounded to six decimal places
(`0.24` in the example). Legacy free-text templates have no pricing object;
with a ceiling configured, dispatch is blocked until the template is a `v: 1`
envelope with `pricing`. That rule also applies to tasks the broker creates
itself (pairwise tie-break and self-verification escalation). Opaque markers
such as `pairwise-tie-break` cannot be priced.

## Broker-generated follow-ups

### Pairwise tie-break

A split crowd review with no S0/S1 minority queues one micro-task. That is
**not** the catalog `pairwise_screenshot_compare` template. The broker emits:

```json
{
  "v": 1,
  "pairwise_tie_break": true,
  "pricing": { "reward": "0.10", "max_assignments": 1 }
}
```

`reward` is copied from the source task when that source is a `v: 1` envelope;
otherwise `"0.05"`. `max_assignments` is always `1`. Identity for stuck-state
and the one-per-job guard is `v === 1 && pairwise_tie_break === true`, plus the
legacy string `pairwise-tie-break`. Only the priced envelope can reserve spend.

With a ceiling set, an opaque marker 422s the successful worker callback
(`Real spend is blocked: structured task pricing and an idempotency key are
required`) and the paid split can stall with no verdict.

### Self-verification escalation

Unresolved machine checks dispatch this envelope, not the opaque string
`self-verification-escalation`:

```json
{
  "v": 1,
  "self_verification_escalation": true,
  "pricing": { "reward": "0.05", "max_assignments": 1 }
}
```

Both follow-ups reserve with `idempotency_key` `review-task:<reviewTaskId>`.

## Ledger

`SpendCeiling` opens `vouch_spend_reservations` on the **runtime** SQLite
database (`RUNTIME_SQLITE_PATH`), not `sqlite-migrations.ts`:

| Column            | Role                                                 |
| ----------------- | ---------------------------------------------------- |
| `idempotency_key` | primary key; retries with the same key reuse the row |
| `job_id`          | must match on replay                                 |
| `amount_usd`      | must match on replay                                 |
| `created_at`      | ISO timestamp                                        |

Replay with the same key, job, and amount is allowed even when the ceiling is
already full. A key reused with a different job or amount throws. Over-ceiling
**new** keys return `allowed: false` and the route surfaces an error such as
`Real spend ceiling reached; operator confirmation required`.

Human-review dispatch requires `idempotency_key` on the task body whenever the
ceiling is set. Pairwise and self-verification follow-ups use
`review-task:<reviewTaskId>`. Failed dispatch (except an ambiguous
`ProviderDispatchError`) **releases** the reservation.

## Operator actions

Raise or clear the cap by changing `VOUCH_REAL_SPEND_CEILING_USD` and
restarting the API (Pi go-live restarts the managed broker). To zero the
ledger, stop the processes and delete the runtime DB; see
[`sqlite-local-runtime.md`](sqlite-local-runtime.md).

`--estimate` on `npm run review` prices a job without dispatching. It does not
write a reservation.

## Pitfalls

- Unset ceiling = no cumulative cap. Job `budget_policy` still exists but is
  not this ledger.
- Simulated local dispatch never calls `reserveRealProviderDispatch`.
- Wiping only `provider-state.sqlite` does not reset spend.
- A tie-break that splits again does not spawn another pairwise task; it
  goes to consensus/adjudication.
- Recovered MTurk HITs must poll `pricing.max_assignments`, not the bridge
  default. See
  [`provider-integration.md`](../architecture/provider-integration.md).

Code: `src/api/spend-ceiling.ts`, `src/config/runtime.ts`,
`src/api/routes/human-review.ts`, `src/api/routes/evidence.ts`,
`src/api/routes/provider-callback.ts`,
`src/domain/human-review/provider-workflow-service.ts`,
`src/domain/self-verification/self-verification-service.ts`.
Tests: `tests/unit/spend-ceiling.test.ts`,
`tests/unit/pairwise-template.test.ts`,
`tests/integration/provider-pairwise-tiebreak.test.ts`,
`tests/integration/self-verification-escalation.test.ts`.
