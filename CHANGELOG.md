# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed

- **Renamed to Vouch.** The product was previously the repository
  `DallasCrilleyMarTech/review-qa-broker` and the package
  `ai-human-review-broker`. The package is now `vouch`, and the Docker image
  tag changed from `ai-human-review-broker` to `vouch`. The Pi command and
  Vouch-prefixed environment variables use the new brand. The current GitHub
  remote remains `dallascrilley/quorum-private` until that repository rename is
  performed. Consensus event fields remain domain terms, and "broker" remains
  the internal name for the service component.
- Moved wire contracts out of the spec scaffold: `specs/00N-*/contracts/` is now
  `contracts/verification-control-plane/`, `contracts/local-runtime/`, and
  `contracts/provider-integration/`.

### Added

- `LICENSE` (MIT), `SECURITY.md`, `CONTRIBUTING.md`, and this changelog.

### Removed

- Internal planning, ideation, and operator-proof documents, along with
  operator tooling that depended on private infrastructure.
