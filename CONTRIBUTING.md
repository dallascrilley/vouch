# Contributing

Thanks for taking a look. This is a small project with a strict gate, so the
fastest path to a merged change is to run the same gate CI runs before you push.

## Setup

Node.js 24 or newer is required — the local runtime uses the built-in
`node:sqlite` module, which is unflagged from Node 24.

```bash
mise install    # reads .mise.toml; or install Node 24+ however you prefer
npm ci
```

`./script/cibuild` also needs Ruby for the OpenAPI version check. It is present
on GitHub runners and on macOS by default.

## The gate

```bash
npm test                    # vitest: contract, integration, and unit suites
npm run lint                # eslint
npm run build               # tsc --noEmit
./script/cibuild            # exactly what CI runs
```

`script/cibuild` is the single source of truth for CI, so local and CI cannot
drift. It runs `npm ci`, `npm run build:js`, `npm run verify`, and the OpenAPI
version check. `npm run verify` routes lint, typecheck, and tests through the
service's own self-verification lifecycle and gates on the resulting verdict.

Before opening a pull request that touches the review loop, run the offline
harnesses too:

```bash
npm run validate:local-runtime
npm run validate:provider-e2e
npm run validate:provider-proof-bundle
npm run validate:agent-loop
npm run validate:pi-extension
```

## Conventions

- **Contract-first.** The HTTP surface is defined in
  `contracts/verification-control-plane/openapi.yaml` and the event surface in
  `contracts/verification-control-plane/events.md`. Change the contract in the
  same commit as the implementation; `tests/contract/` asserts both.
- **Tests are behavioral.** Add coverage under `tests/contract/` for wire
  surfaces, `tests/integration/` for flows through the assembled app, and
  `tests/unit/` for isolated logic.
- **Commit messages** follow Conventional Commits
  (`type(scope): subject`, imperative, 50 characters or fewer). `.gitmessage`
  is a template you can install with
  `git config commit.template .gitmessage`.
- **Never weaken a gate to get it green.** If a check is wrong, fix the check
  and say so in the pull request.
- **No secrets, ever.** `.env*` is ignored. Provider credentials, callback
  secrets, and account identifiers stay out of the repository, including in
  test fixtures and documentation. The one sanctioned exception: opaque,
  sandbox-scoped correlation ids (HIT/assignment ids with pseudonymized
  workers) may appear in replay fixtures as provenance — they identify no
  account and resolve to nothing without requester credentials.

## Optional local hooks

```bash
pre-commit install    # trailing whitespace, EOF, merge conflicts, eslint
```

Not required for CI.

## Pull requests

One focused change per pull request, with the commands you ran and their
results in the description. `.github/PULL_REQUEST_TEMPLATE.md` has the shape.
