# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed

- **Rebranded to Vouch** (formerly Quorum). User-facing copy and brand assets live
  in `docs/brand/`; the npm package name remains `quorum` for now.
- **Renamed to Quorum.** The project was previously the repository
  `DallasCrilleyMarTech/review-qa-broker` and the package
  `ai-human-review-broker`. It is now `dallascrilley/quorum` and the package
  `quorum`. The Docker image tag changed from `ai-human-review-broker` to
  `quorum`. HTTP routes, event names, and environment variables are unchanged;
  "broker" remains the internal name for the service component.
- Moved wire contracts out of the spec scaffold: `specs/00N-*/contracts/` is now
  `contracts/verification-control-plane/`, `contracts/local-runtime/`, and
  `contracts/provider-integration/`.

### Added

- `LICENSE` (MIT), `SECURITY.md`, `CONTRIBUTING.md`, and this changelog.

### Removed

- Internal planning, ideation, and operator-proof documents, along with
  operator tooling that depended on private infrastructure.
