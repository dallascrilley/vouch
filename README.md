![Vouch — Human review as an API.](docs/brand/lockup.png)

Agents submit work. Real reviewers return a consensus verdict.

[![ci](https://github.com/dallascrilley/vouch/actions/workflows/ci.yml/badge.svg)](https://github.com/dallascrilley/vouch/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-24%2B-brightgreen.svg)](.mise.toml)

An autonomous agent can tell you its screenshot rendered. It cannot tell you the
hero headline overlaps the CTA. Vouch is the service that closes that gap: an
agent POSTs a verification job with artifacts, Vouch gates the evidence for
privacy, routes what machines cannot settle to human reviewers, aggregates their
answers into a consensus verdict, adjudicates disagreement, and hands the agent
back a machine-readable next action and repair hints.

> **Formerly Quorum.** The repository, package, and Docker image are now `vouch`.
> `quorum_state` and related consensus fields stay as domain terms, not branding.
> See [docs/brand/BRAND.md](docs/brand/BRAND.md) for the brand kit.

## Provenance

Vouch is original work in this repository: the verification control plane, privacy
gate, consensus and adjudication, ledger, agent CLI, OpenAPI contracts, and offline
harnesses. Provider adapters (including the Mechanical Turk bridge) are integration
code against external platforms; those platforms are not part of this repo. There is
no upstream template this service is forked from.

**What CI proves offline:** install, build, lint, typecheck, unit/contract tests, and
the five simulated harnesses (local runtime, provider e2e, proof-bundle replay, agent
loop, Pi extension). **What is self-reported:** live crowd platforms such as MTurk require your own
AWS/requester setup and are not exercised in CI.

## See it in under a minute

One command spawns the API, the dispatch worker, and the agent CLI, drives a
screenshot through the whole review loop, and asserts the agent got an
actionable answer back:

```console
$ npm ci && npm run validate:agent-loop

{
  "agent_next_action": "pass",
  "job_id": "job_1e3152bc-09e6-4828-a37d-53322e334122",
  "status": "agent loop validation passed"
}
$ echo $?
0
```

The exit code is the contract an agent branches on: `0` pass, `1` fail,
`2` retry, `3` recapture, `4` escalate, `5` pending. stdout is a single JSON
object carrying the verdict, the unresolved criteria, and repair hints.

## Verify it yourself, offline

The reason to trust any of the above is that you can reproduce it on a laptop
with no accounts, no API keys, and no network calls. Five harnesses drive the
real service through the real review loop against simulated reviewers, and the
unit and contract suite covers the rest.

```bash
mise install     # or install Node 24+ any way you like
npm ci
npm test                                  # 173 tests, 72 files
npm run validate:local-runtime            # SQLite persistence + inspection endpoints
npm run validate:provider-e2e             # dispatch -> callback -> auto-advance -> pass verdict
npm run validate:provider-proof-bundle    # replay captured provider return-paths
npm run validate:agent-loop               # API + worker + CLI, full round trip
npm run validate:pi-extension             # Pi loader + loopback broker + simulated human_review
```

Each harness exits non-zero on failure and prints a JSON receipt on success:

| Command                                  | What it proves                                                                                                                                                  | Success output                                    |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `npm run validate:local-runtime`         | Job intake, artifact attach, privacy gate, and self-verification survive a real SQLite runtime; inspection endpoints report the job.                            | `local runtime validation passed`                 |
| `npm run validate:provider-e2e`          | A provider task is dispatched, a signed callback is ingested, consensus auto-advances, and the job reaches a `pass` verdict.                                    | `"status": "simulated provider e2e passed"`       |
| `npm run validate:provider-proof-bundle` | Recorded provider return-paths (pass, ambiguous, fail) replay to the same broker outcomes, so return-path regressions are caught without a live crowd platform. | `"status": "provider proof-bundle replay passed"` |
| `npm run validate:agent-loop`            | The full agent path: spawn the API and dispatch worker, run the `review` CLI with `--wait`, and assert exit `0` with `agent_next_action: pass`.                 | `"status": "agent loop validation passed"`        |
| `npm run validate:pi-extension`          | Pi loads `extensions/pi`, a loopback broker supervisor starts, and a simulated `human_review` settles.                                                          | `"status": "pi extension validation passed"`      |

`npm run verify` runs lint, typecheck, and tests _through_ the service itself:
the checks become acceptance criteria on a verification job, and the resulting
verdict decides whether the change is allowed. `./script/cibuild` is what CI
runs, and it calls `verify`. `npm run format` (`prettier --check .`) is a
separate check — it does not rewrite files, and `verify` does not run it. See
[docs/ops/ci.md](docs/ops/ci.md).

## Use it from Pi

The repository also ships a Pi extension that wraps the five-call review
choreography behind one `human_review` tool. It starts an authenticated,
loopback-only broker lazily, defaults to simulated reviewers, and exposes
`/vouch-review` plus a guided sandbox go-live command. See
[extensions/pi/README.md](extensions/pi/README.md) for install, retention, and
the real-reviewer safety gates.

## Running it for real

Start the API and the dispatch worker, then commission a review from the CLI:

```bash
npm run dev          # terminal 1 — API on :3000
npm run dev:worker   # terminal 2 — provider dispatch
npm run review -- --help
```

```bash
npm run review -- \
  --template binary_screenshot_check \
  --question "hero-visible:The hero headline is visible." \
  --screenshot path/to/screenshot.png \
  --risk medium --wait
```

Five survey templates ship: yes/no screenshot checks, A/B screenshot compares,
1–5 rubric ratings, field-extraction checks, and instruction-following checks.
`--estimate` prices a job without dispatching it; `--resume` and `--status` poll
a job commissioned earlier. Real-provider dispatch also honors
`VOUCH_REAL_SPEND_CEILING_USD` when set
([docs/ops/spend-ceiling.md](docs/ops/spend-ceiling.md)). The wire contract is
[docs/architecture/agent-review-contract.md](docs/architecture/agent-review-contract.md);
the integration guide is
[docs/architecture/agent-loop-integration.md](docs/architecture/agent-loop-integration.md).

The container image builds from the repository `Dockerfile`:

```bash
docker build -t vouch:latest .
docker run -d -p 3000:3000 -v vouch-data:/data \
  -e RUNTIME_OPERATOR_TOKEN="$(openssl rand -hex 32)" \
  vouch:latest
```

`GET /health` with `x-operator-token` returns runtime mode and `database_path`;
with `x-health-challenge` it returns a `health_proof` HMAC instead. State
persists under `/data`; `SIGTERM` drains cleanly. Full guidance, including the
worker, spend ceiling, and security-relevant configuration
(`RUNTIME_OPERATOR_TOKEN`, `PROVIDER_SHARED_SECRET`,
`VOUCH_REAL_SPEND_CEILING_USD`), is in
[docs/ops/deployment.md](docs/ops/deployment.md).

## How it fits together

```text
       agent
         │  POST /verification-jobs  (+ artifacts, acceptance criteria)
         ▼
  ┌──────────────────────────────────────────────────────────────┐
  │  privacy gate      classify evidence; fail closed on secret,  │
  │                    regulated, or failed-redaction material    │
  ├──────────────────────────────────────────────────────────────┤
  │  self-verification machine checks settle what they can        │
  ├──────────────────────────────────────────────────────────────┤
  │  human review      unresolved criteria become review tasks;   │
  │                    the dispatch worker sends a sanitized      │
  │                    package to a provider adapter              │
  ├──────────────────────────────────────────────────────────────┤
  │  consensus         aggregate independent reviewer responses   │
  │  adjudication      break ties, escalate severe minorities     │
  ├──────────────────────────────────────────────────────────────┤
  │  verdict + ledger  durable outcome, budget and retention      │
  │                    events, machine-readable feedback          │
  └──────────────────────────────────────────────────────────────┘
         │  GET /verification-jobs/:id/feedback
         ▼
       agent (pass / fail / retry / recapture / escalate)
```

Design decisions worth naming:

- **Fail closed on privacy, not open.** Evidence classified secret, regulated,
  or failed-redaction never leaves for external review; it fails the job instead.
  Enforced in [`src/domain/privacy/`](src/domain/privacy/) and covered by
  `tests/integration/security-regression.test.ts`.
- **The verdict is a ledger entry, not a return value.** Budget blocks, retries,
  and adjudications are all recorded events, which is what makes the loop
  auditable after the fact. See [`src/domain/ledger/`](src/domain/ledger/).
- **A simulator can never greenwash a failing gate.** Hard machine failures stay
  machine-resolved; only genuinely unresolved criteria escalate to humans.
- **Contract-first.** The HTTP surface lives in
  [`contracts/verification-control-plane/openapi.yaml`](contracts/verification-control-plane/openapi.yaml)
  and events in [`events.md`](contracts/verification-control-plane/events.md);
  `tests/contract/` asserts the implementation against both.

Deeper reading: [docs/architecture/](docs/architecture/) for the control plane,
the agent loop, and the provider integration;
[docs/security/](docs/security/) for the privacy-gate threat model and secret
handling.

## Honest boundaries

- **The reviewers in every command above are simulated.** The offline harnesses
  prove the loop, not that a crowd of humans is standing by. The Amazon
  Mechanical Turk adapter (`scripts/mturk-bridge.ts`) is real code, but running
  it needs your own AWS account and MTurk requester setup, and nothing in CI or
  in the harnesses exercises it.
- **Single-node by design.** State is SQLite on local disk and the queue is a
  SQLite table. That is deliberate for a service you can run and audit on one
  box; it is not a horizontally scaled deployment.
- **Metrics are a local sink.** `GET /runtime/metrics` reports in-process
  counters. OpenTelemetry export is a planned adapter, not shipped.
- **No hosted instance.** There is nothing to sign up for. Everything here runs
  from this repository.
- **Not published to a registry.** `package.json` is `"private": true` on purpose
  (source install only). Install by cloning; there is no `npm install vouch`.

## Requirements

Node.js 24 or newer — the local runtime uses the built-in `node:sqlite` module,
which is unflagged from Node 24. `mise install` reads `.mise.toml`; any Node 24+
installation works. `./script/cibuild` additionally needs Ruby, which is present
on GitHub runners and on macOS by default.

## Contributing and security

[CONTRIBUTING.md](CONTRIBUTING.md) covers the local gate and the conventions.
[SECURITY.md](SECURITY.md) covers reporting a vulnerability.

## License

MIT — see [LICENSE](LICENSE).
