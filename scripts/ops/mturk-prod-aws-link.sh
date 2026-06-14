#!/usr/bin/env bash
# Open production MTurk requester registration (link AWS 181596276354 to prod MTurk).
# Stops at AWS root passkey MFA — complete the browser prompt, then verify on Bux:
#   ssh bux-cmd 'cd ~/Code/ai-human-review-broker-agent-loop && set -a && source .env && AWS_DEFAULT_REGION=us-east-1 aws mturk get-account-balance --endpoint-url https://mturk-requester.us-east-1.amazonaws.com'
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

command -v agent-browser >/dev/null 2>&1 || { echo "agent-browser required"; exit 1; }
command -v op >/dev/null 2>&1 || { echo "op CLI required for AWS root creds"; exit 1; }

export AGENT_BROWSER_SESSION_NAME=mturk-requester-prod
AWS_EMAIL=$(op item get p426v5h7b2cjgsawo6gf7esgkq --vault Private --fields username)
AWS_PASS=$(op item get p426v5h7b2cjgsawo6gf7esgkq --vault Private --fields password --reveal)

ab() {
  agent-browser "$@" || return 1
}

agent-browser close --all 2>/dev/null || true
agent-browser --headed open "https://requester.mturk.com/begin_aws_signin"
sleep 3

if ! ab find placeholder "Email address" fill "$AWS_EMAIL"; then
  echo "error: could not fill AWS root email" >&2
  exit 1
fi
if ! ab find role button click --name Next; then
  echo "error: could not click Next on AWS sign-in" >&2
  exit 1
fi
sleep 4

if ! ab find placeholder "Password" fill "$AWS_PASS"; then
  echo "error: could not fill AWS root password" >&2
  exit 1
fi
if ! ab find role button click --name "Sign in"; then
  echo "error: could not click Sign in on AWS password page" >&2
  exit 1
fi

echo "Complete AWS passkey in the headed Chrome window, then finish MTurk registration in the console."
echo "Verify on Bux:"
echo "  ssh bux-cmd 'cd ~/Code/ai-human-review-broker-agent-loop && set -a && source .env && AWS_DEFAULT_REGION=us-east-1 aws mturk get-account-balance --endpoint-url https://mturk-requester.us-east-1.amazonaws.com'"
