# Local Runtime Data Handling

The SQLite local runtime keeps verification state on the developer machine and does not require hosted queues or external review infrastructure for validation.

## Stored Data

- Verification jobs, criteria, artifacts metadata, privacy classifications, self-verification results, review tasks, responses, consensus, adjudication, verdicts, feedback, ledger events, and real-dispatch spend reservations live in the SQLite database configured by `RUNTIME_SQLITE_PATH`.
- Provider task mappings and callback receipts live in `PROVIDER_SQLITE_PATH`.
- Artifact files and future sanitized packages live under `RUNTIME_ARTIFACT_ROOT`.
- The Pi extension keeps handles, an operator token, `live.env`, and bridge state under `~/.vouch/pi` (override with `VOUCH_PI_DATA_DIR`).

## Privacy Expectations

- Privacy classification remains fail-closed.
- `blocked_fail_closed` still emits a terminal verdict and machine-readable feedback.
- Local provider simulation is deterministic and does not externalize artifacts.

## Operator Guidance

- Keep `.runtime/` and `~/.vouch/pi` out of commits.
- Use temporary runtime roots for validation and CI-like local checks.
- Remove runtime files before handing a machine to another operator if the persisted state contains sensitive internal evidence. Reset **both** SQLite files; see [`docs/ops/sqlite-local-runtime.md`](../ops/sqlite-local-runtime.md).
