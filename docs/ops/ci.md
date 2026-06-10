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
