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
- **Engine errors:** CI uses Node 24; match locally with `.mise.toml`.
- **Link check failures:** fix broken `docs/**/*.md` or `README.md` links before merge.
