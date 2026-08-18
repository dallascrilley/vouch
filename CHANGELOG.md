# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **Pi extension** (`extensions/pi/`): packages Vouch human review as a single
  `human_review` tool plus two read primitives, with an extension-managed
  per-machine broker, demo-first onboarding, and an ambient TUI verdict
  experience. Design notes live in `docs/plans/`.
- **Spend ceiling** (`src/api/spend-ceiling.ts`): a hard per-window cost bound
  enforced before provider dispatch.
- Offline harness `npm run validate:pi-extension`, wired into CI alongside the
  existing local-runtime, provider-e2e, proof-bundle, and agent-loop harnesses.
- Evidence route and privacy-gate hardening, including a health proof that the
  gate fails closed on secret, regulated, or failed-redaction evidence.
- `LICENSE` (MIT), `SECURITY.md`, `CONTRIBUTING.md`, and this changelog.

### Changed

- **Renamed to Vouch.** The project was previously the repository
  `DallasCrilleyMarTech/review-qa-broker` and the package
  `ai-human-review-broker`, then briefly `quorum`. It is now
  `dallascrilley/vouch` and the package `vouch`; the Docker image tag changed
  from `ai-human-review-broker` to `vouch`. The Pi command and Vouch-prefixed
  environment variables use the new brand. User-facing copy and brand assets
  live in `docs/brand/`. Consensus event fields such as `quorum_state` remain
  domain terms, and "broker" remains the internal name for the service
  component.
- Moved wire contracts out of the spec scaffold: `specs/00N-*/contracts/` is now
  `contracts/verification-control-plane/`, `contracts/local-runtime/`, and
  `contracts/provider-integration/`.

### Fixed

- Expired human reviews now close as a terminal state instead of stalling the
  dispatch worker.

### Removed

- Internal ideation and operator-proof documents, along with operator tooling
  that depended on private infrastructure.
