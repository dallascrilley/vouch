# Documentation

| Path            | Purpose                                                                                               |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| `architecture/` | How the verification control plane, agent loop, provider integration, and local runtime fit together. |
| `ops/`          | Running the service: deployment, CI, the dev-workflow gate, and validation procedures.                |
| `security/`     | Privacy-gate threat model, local data handling, and provider secret handling.                         |
| `decisions/`    | Architecture Decision Records. One file per decision, numbered.                                       |
| `plans/`        | Implementation plans for larger features, kept after the work ships.                                  |
| `brand/`        | Vouch brand kit: marks, palette, and usage rules.                                                     |

Wire contracts live outside `docs/` in [`contracts/`](../contracts/), because
they are asserted by `tests/contract/` rather than read by humans alone.

## Start here after a control-plane change

| If you need                                      | Read                                                                                                                                                           |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What actually runs today                         | [`architecture/runtime-target.md`](architecture/runtime-target.md), [`architecture/verification-control-plane.md`](architecture/verification-control-plane.md) |
| Privacy fail-closed, go-live grant, health proof | [`architecture/privacy-gate.md`](architecture/privacy-gate.md)                                                                                                 |
| Real-dispatch cost cap                           | [`ops/spend-ceiling.md`](ops/spend-ceiling.md)                                                                                                                 |
| Human-review task idempotency replay             | [`architecture/human-review-task-idempotency.md`](architecture/human-review-task-idempotency.md)                                                               |
| SQLite paths, inspection auth, reset             | [`ops/sqlite-local-runtime.md`](ops/sqlite-local-runtime.md)                                                                                                   |
| Pi install and live-review pitfalls              | [`extensions/pi/README.md`](../extensions/pi/README.md)                                                                                                        |

## Conventions

- New architectural decision: copy `decisions/0000-template.md` to the next
  number.
- Keep docs close to the code they describe, and link them from `README.md`
  when they are user-facing.
