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

## Conventions

- New architectural decision: copy `decisions/0000-template.md` to the next
  number.
- Keep docs close to the code they describe, and link them from `README.md`
  when they are user-facing.
