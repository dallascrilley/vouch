---
title: GitHub Actions CI speed and cost optimization via path-scoped checks
date: 2026-06-14
category: workflow
module: ci
tags:
  - github-actions
  - ci-cd
  - performance
  - cost
  - lychee
  - paths-filter
  - ce-optimize
applies_when:
  - Single-job CI where markdown link check runs on every PR
  - Optimizing wall time and billable minutes without dropping release gates
  - Running ce-optimize against workflow YAML changes
related:
  - docs/ops/ci.md
---

# GitHub Actions CI speed and cost optimization via path-scoped checks

## Context

`ai-human-review-broker` CI (`.github/workflows/ci.yml`) ran one `ubuntu-latest`
job: checkout → setup-node (npm cache) → `./script/cibuild` (~50s on GHA) →
lychee on all pushes/PRs (~1s). GHA run `27512479286` totaled ~57s wall time.

Goal: maximize speed and minimize billable minutes while keeping
`script/cibuild` (lint, build, verify, OpenAPI check) as the correctness anchor.

## What didn't work

- **Treating lychee as free to skip entirely** — doc links still need checking;
  unconditional removal fails `required_checks_present` gate.
- **`contains(github.event.pull_request.changed_files, 'md')`** — not a valid
  expression for per-file PR diffs; use `dorny/paths-filter` or split jobs.
- **Measuring only full local `./script/cibuild` time** — workflow-only wins
  (shallow clone, concurrency) don't show up unless the harness models GHA
  checkout/setup overhead.
- **Running ce-optimize worktrees without eslint ignore** — lint scanned
  `.worktrees/**/*.ts` from the parent checkout and failed with 176 parser
  errors (`parserOptions.project` — file not in tsconfig). Fix: add
  `.worktrees/` to `eslint.config.js` ignores.
- **High variance in local timing** — `npm ci` ranged ~20–50s depending on cache
  warmth; compare experiments in one session, not across cold/warm baselines.
- **`fetch-depth: 1` with paths-filter on push** — push events need two commits
  for git diff; use `fetch-depth: 2` minimum.

## Guidance

### Winning workflow changes (`optimize/ci-speed-cost`)

1. **`concurrency` + `cancel-in-progress: true`** — cancels superseded runs on
   rapid pushes; saves real GHA minutes (no local wall-time change).

2. **`fetch-depth: 2` on checkout** — shallow clone with enough history for
   `dorny/paths-filter` push detection (depth 1 breaks push diffs). PRs use the
   GitHub API and are unaffected.

3. **`dorny/paths-filter@v3` + conditional lychee** — run link check only when
   doc paths change (`**/*.md`, `docs/**`, `specs/**`) or on `workflow_dispatch`.
   Code-only PRs skip lychee; largest modeled win for typical PRs.

4. **`npm ci --no-audit --no-fund` in `script/lib/profile.sh`** — minor install
   shave; safe for CI.

### Measurement harness

`scripts/ops/measure-ci.sh` (immutable for ce-optimize experiments):

- Times `./script/cibuild` + lychee locally
- Parses workflow YAML for `job_count`, npm cache, path filters, concurrency,
  `fetch-depth`
- Emits JSON for ce-optimize gates/diagnostics
- Models GHA overhead: `ci_wall_seconds = cibuild + checkout_overhead + setup_node_overhead`
  (+ lychee when no path filters; code-PR model skips lychee when paths-filter present)

Run: `bash scripts/ops/measure-ci.sh`

### ce-optimize spec snapshot

Local ce-optimize artifacts live under `.context/` (gitignored). Campaign
settings for reference:

- Primary metric: `ci_wall_seconds` minimize
- Gates: `ci_passed`, `required_checks_present`, `job_count <= 2`
- Harness: `bash scripts/ops/measure-ci.sh`

Baseline harness ~56s (cold npm) → final combined ~22s (warm cache). Treat
absolute seconds as directional; validate on GHA after merge.

## Why it works

- **cibuild dominates** (~88% of GHA wall time) — workflow micro-opts alone
  won't beat install/build/verify; path-scoping *optional* steps (lychee) is
  high leverage on code-heavy repos.
- **Billable minutes ≈ wall seconds** for a single serial job on
  `ubuntu-latest` — optimizing typical PR path time reduces both speed and cost.
- **Concurrency** attacks a different cost axis (duplicate runs) without
  touching full-path duration.

## When to apply

- Before adding always-on CI steps — ask whether `paths-filter` or job-level
  `if:` can scope them.
- Before splitting into parallel jobs for "speed" — parallel jobs can reduce
  wall-clock to first failure but **increase** billable minutes; keep
  `job_count` gated.
- When running ce-optimize on workflows: model GHA fixed costs in the harness;
  ignore `.worktrees/` in eslint; copy `measure-ci.sh` into experiment
  worktrees (harness is untracked until committed on the optimization branch).
- After workflow changes: `gh workflow run ci --ref <branch> && gh run watch`
  to confirm real GHA timing.

## Prevention

- Keep `script/cibuild` as single source of truth; don't duplicate its steps in
  YAML-only forks that drift from local `just cibuild`.
- Document conditional steps in `docs/ops/ci.md` when behavior changes.
- Search `docs/solutions/workflow/` before the next CI tuning pass.
