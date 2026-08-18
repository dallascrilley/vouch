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
envelope with `pricing`.

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
ceiling is set. Self-verification escalation uses
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

Code: `src/api/spend-ceiling.ts`, `src/config/runtime.ts`,
`src/api/routes/human-review.ts`, `src/api/routes/evidence.ts`.
Tests: `tests/unit/spend-ceiling.test.ts`.
