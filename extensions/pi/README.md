# Vouch Pi extension

This extension adds `human_review`, `review_status`, and
`list_pending_reviews` to [Pi](https://pi.dev), plus `/vouch-review` for a manual
check and `/vouch-go-live` for the deliberate real-reviewer ceremony.

## Install from a checkout

From the Vouch repository root:

```bash
npm ci
npm run build:js
pi install ./extensions/pi
```

The extension manages one authenticated, loopback-only broker pair per machine.
It starts lazily on the first review, stores handles and broker state under
`~/.vouch/pi` by default, and leaves detached broker children running when Pi
closes so ambient reviews can finish.

## Demo mode

Demo mode is the default and never needs credentials or network access:

```text
human_review({
  "template_id": "text_quality_rubric",
  "text": "The headline is visible.",
  "criteria": [{"criterion_id": "headline", "statement": "The headline is visible."}]
})
```

The result envelope always contains `simulated: true` in demo mode. A settled
demo result is suitable for testing the agent loop, not for claiming that a
human reviewed the work. Use `npm run validate:pi-extension` for the offline
spawn-to-verdict harness.

## Go-live and spend

Run `/vouch-go-live` in an interactive Pi session. Enter `op://` references,
not resolved credential values. The ceremony checks for the `aws` CLI, asks for
a cumulative sandbox ceiling, protects any ambient review from an unconfirmed
restart, writes only references to `~/.vouch/pi/live.env` with mode `0600`,
restarts the broker under `op run --env-file`, and starts the loopback MTurk
bridge on port 3100. Production remains disabled; enabling
`MTURK_ALLOW_PRODUCTION` is an explicit separate operator action.

Real dispatch reservations are durable in the broker SQLite database and are
idempotent by review key. A missing or exceeded cost reservation returns
`not_reviewed` with a spend-block reason; it does not silently fall back to a
simulated verdict.

## Configuration and retention

- `VOUCH_PI_DATA_DIR` changes the extension data directory.
- `VOUCH_PI_BROKER_URL` attaches to an already-managed broker instead of
  spawning local children.
- `VOUCH_PI_BROKER_TOKEN` authenticates that external broker; it is read only
  from the process environment and is never written to the extension data dir.
- `VOUCH_OP_PATH` overrides the `op` shim path used for supervised launches;
  the default is `$HOME/.local/bin/op`.
- `handles.json`, `operator-token`, `live.env`, SQLite state, and bridge state
  are local runtime data and should remain outside Git. Delete them only after
  confirming no review is in flight and retaining any required evidence.

The real MTurk sandbox path and cross-session bridge survival still require a
manual operator walkthrough with valid AWS/MTurk setup; CI never spends money.
