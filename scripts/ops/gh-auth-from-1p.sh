#!/usr/bin/env bash
# Refresh GitHub CLI auth from 1Password (Private vault / GitHub PAT Classic).
# Use when `gh` returns HTTP 401 or `gh run watch` dies mid-session.
set -euo pipefail

command -v op >/dev/null 2>&1 || { echo "op CLI required"; exit 1; }
command -v gh >/dev/null 2>&1 || { echo "gh CLI required"; exit 1; }

# Inherited GITHUB_TOKEN shadows keyring login.
unset GITHUB_TOKEN GITHUB_PERSONAL_ACCESS_TOKEN

op read "op://Private/GitHub PAT Classic/credential" | gh auth login --with-token
gh auth setup-git 2>/dev/null || true
gh auth status

echo "OK: gh authenticated from 1Password GitHub PAT Classic"
