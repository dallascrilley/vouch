# CI

Workflow: `.github/workflows/ci.yml` (`ci`)

## What runs

1. `npm ci` (Node 24)
2. `npm run build:js`
3. `npm run verify` — lint, type-check, tests through broker gate
4. OpenAPI 3.1 contract check
5. Markdown link check (lychee)

## Local parity

```bash
mise install
npm ci
npm run verify
npm run build:js
```

## Manual trigger

If push-triggered runs are missing (Actions disabled or repo just enabled):

```bash
gh workflow run ci --ref main
gh run watch
```

Or use **Actions → ci → Run workflow** in GitHub.

## Troubleshooting

- **Zero runs in history:** enable Actions under repo **Settings → Actions → General**.
- **Runs stuck in `queued`:** check repo Actions permissions first:

  ```bash
  gh api repos/DallasCrilleyMarTech/review-qa-broker/actions/permissions
  ```

  If `"enabled": false` with org conflict (`409`), Actions is disabled at the **organization** level — a repo admin must allow Actions under **Org → Settings → Actions → Policies**, then re-enable on the repo. Until then, use local `npm run verify`.

- **Queued with Actions enabled:** private repos need GitHub-hosted runner minutes or a self-hosted runner. Local `npm run verify` is the interim gate.
- **Engine errors:** CI uses Node 24; match locally with `.mise.toml`.
- **Link check failures:** fix broken `docs/**/*.md` or `README.md` links before merge.

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
const artifact = JSON.parse(readFileSync(".runtime/verify-verdict.json", "utf8"));
if (!verifyReleaseArtifact(artifact, process.env.RELEASE_GATE_SIGNING_KEY!) ||
    artifact.release_gate_effect !== "allow") process.exit(1);
```

**Key rotation:** rotate by setting a new `RELEASE_GATE_SIGNING_KEY` on the broker and all verifiers in one deploy window; artifacts only verify against the key that signed them, so re-run `npm run verify` (or re-fetch the artifact) after rotation. The artifact contains only verdict metadata and hashes — never raw evidence.

Over HTTP the endpoint is guarded like the inspection routes: send `x-operator-token` when `RUNTIME_OPERATOR_TOKEN` is configured (required in production).
