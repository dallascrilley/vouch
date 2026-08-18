# CI

Workflow: `.github/workflows/ci.yml` (`ci`)

## What runs

`.github/workflows/ci.yml` does not list the install/gate commands itself. It
runs `./script/cibuild`, then the offline harnesses. `script/cibuild` calls
`run_cibuild` in `script/lib/profile.sh` — that function is the step list to
edit when the gate changes.

1. `npm ci` (Node 24)
2. `npm run build:js`
3. `npm run verify` — lint, type-check, tests through the self-verification gate
4. OpenAPI 3.1 contract check
5. Five offline harnesses: `validate:local-runtime`, `validate:provider-e2e`, `validate:provider-proof-bundle`, `validate:agent-loop`, `validate:pi-extension`
6. Markdown link check (lychee) — **only when doc paths change** (`**/*.md`, `docs/**`, `contracts/**`) or on `workflow_dispatch`

`run_cibuild` is authoritative for the install/gate half. If it includes
`npm run format`, that check runs there (not as a separate `ci.yml` job).

Workflow also uses shallow checkout (`fetch-depth: 2` — enough for paths-filter on push), npm cache, and `concurrency` with `cancel-in-progress` to drop superseded runs.

## Format

`npm run format` is `prettier --check .` — **check only**, it does not rewrite
files. It is **not** one of `verify`'s broker checks (`scripts/verify-change.ts`
`CHECKS` are `lint`, `build`, `test` only) and `ci.yml` does not call Prettier.
A format gate belongs in `run_cibuild` so local `./script/cibuild` cannot drift
from CI.

```bash
npm run format                 # non-zero if any tracked file drifted
npx prettier --write .         # apply repo-wide
npx prettier --write path.md   # one path
```

Config is `prettier.config.js` (`semi: true`, `singleQuote: false`,
`trailingComma: "none"`). `.editorconfig` keeps trailing whitespace in
Markdown. Durable ignore patterns live in `.prettierignore` (lockfiles,
`dist/`, coverage).

**`.gitignore` is also an ignore file.** Prettier 3 defaults `--ignore-path` to
`[.gitignore, .prettierignore]`. A path that was gitignored when someone ran
the formatter, then later tracked, will not have been checked. That is how
`docs/plans/` landed unformatted when #28 published the plans tree: the ignore
rule was removed in the same change that added the file. Tracked docs belong
under Prettier; do not use a temporary gitignore entry as a format skip.

## Local parity

```bash
mise install
./script/cibuild
npm run format
```

## Manual trigger

If push-triggered runs are missing (Actions disabled or repo just enabled):

```bash
gh workflow run ci --ref main
gh run watch
```

Or use **Actions → ci → Run workflow** in GitHub.

## Troubleshooting

- **Zero runs in history:** enable Actions under repo **Settings → Actions → General**, then check:

  ```bash
  gh api repos/dallascrilley/vouch/actions/permissions
  ```

- **Runs stuck in `queued`:** the repository needs GitHub-hosted runner minutes or a self-hosted runner. Local `./script/cibuild` is the interim gate.
- **Engine errors:** CI uses Node 24; match locally with `.mise.toml`.
- **`ruby not found`:** `script/cibuild` uses Ruby for the OpenAPI version check. GitHub runners and macOS ship it.
- **`prettier --check` / `npm run format` fails:** the listed files drifted. `npm run format` does not rewrite them — run `npx prettier --write <path>` (or `.`) then re-check. Confirm the path is not skipped by `.gitignore` or `.prettierignore`.
- **Link check failures:** fix broken `docs/**/*.md`, `contracts/**/*.md`, or `README.md` links before merge.

## Signed release-gate artifact

On every gate run `npm run verify` writes a signed verdict export to `.runtime/verify-verdict.json` (fetched from `GET /verification-jobs/:jobId/release-artifact`):

```json
{
  "job_id": "job_…",
  "final_verdict": "pass",
  "release_gate_effect": "allow",
  "ledger_attestation_hash": "<sha256 over the job ledger>",
  "signed_at": "2026-06-10T00:00:00.000Z",
  "signature": "<hmac-sha256 hex>"
}
```

Signing uses HMAC-SHA256 with `RELEASE_GATE_SIGNING_KEY`. Locally the gate falls back to the well-known dev key `local-dev-release-gate-key`; CI and any artifact that leaves the machine must set a real secret. A downstream policy service verifies with `verifyReleaseArtifact` from `src/domain/feedback/release-artifact.ts` (or any HMAC-SHA256 implementation over the canonical payload) and requires `release_gate_effect === "allow"`:

```ts
import { verifyReleaseArtifact } from "./release-artifact.js";
const artifact = JSON.parse(
  readFileSync(".runtime/verify-verdict.json", "utf8")
);
if (
  !verifyReleaseArtifact(artifact, process.env.RELEASE_GATE_SIGNING_KEY!) ||
  artifact.release_gate_effect !== "allow"
)
  process.exit(1);
```

**Key rotation:** rotate by setting a new `RELEASE_GATE_SIGNING_KEY` on the broker and all verifiers in one deploy window; artifacts only verify against the key that signed them, so re-run `npm run verify` (or re-fetch the artifact) after rotation. The artifact contains only verdict metadata and hashes — never raw evidence.

Over HTTP the endpoint is guarded like the inspection routes: send `x-operator-token` when `RUNTIME_OPERATOR_TOKEN` is configured (required in production).
