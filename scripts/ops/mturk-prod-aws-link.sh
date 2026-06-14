#!/usr/bin/env bash
# Open production MTurk requester registration (link AWS 181596276354 to prod MTurk).
# Stops at AWS root passkey MFA — complete the browser prompt, then re-run:
#   ssh bux-cmd 'aws mturk get-account-balance --endpoint-url https://mturk-requester.us-east-1.amazonaws.com'
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

command -v agent-browser >/dev/null 2>&1 || { echo "agent-browser required"; exit 1; }
command -v op >/dev/null 2>&1 || { echo "op CLI required for AWS root creds"; exit 1; }

export AGENT_BROWSER_SESSION_NAME=mturk-requester-prod
AWS_EMAIL=$(op item get p426v5h7b2cjgsawo6gf7esgkq --vault Private --fields username)
AWS_PASS=$(op item get p426v5h7b2cjgsawo6gf7esgkq --vault Private --fields password --reveal)

agent-browser close --all 2>/dev/null || true
agent-browser --headed open "https://requester.mturk.com/begin_aws_signin"
sleep 2
agent-browser fill e16 "$AWS_EMAIL" || agent-browser find placeholder "Email address" fill "$AWS_EMAIL"
agent-browser click e12 || agent-browser find role button click --name Next
sleep 4
agent-browser fill e11 "$AWS_PASS" || agent-browser find placeholder "Password" fill "$AWS_PASS"
agent-browser click e7 || agent-browser find role button click --name "Sign in"

echo "Complete AWS passkey in the headed Chrome window, then finish MTurk registration in the console."
echo "Verify on Bux: aws mturk get-account-balance --endpoint-url https://mturk-requester.us-east-1.amazonaws.com"
