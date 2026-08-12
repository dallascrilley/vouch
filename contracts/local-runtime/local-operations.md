# Local Operations Contract

## Purpose

Defines the local-only operating expectations for validation, provider simulation, and operator workflows.

## Local Validation Contract

- Lint, type check, tests, contract validation, and quickstart validation are executable locally.
- No required validation step depends on GitHub Actions.
- The documented validation path is authoritative for this feature.

## Provider Simulation Contract

- Local provider simulation must support review task creation, structured response submission, consensus input, and adjudication scenarios.
- Local simulation must preserve existing privacy boundaries and provider-neutral shapes.

## Reset and Inspection Contract

- Operators can inspect the SQLite database location, local artifacts directory, and queue state.
- Operators can reset local runtime state safely using documented local procedures without manually editing implementation files.
