# MTurk Access: Accounts, Credentials, and Login Paths

Last verified: 2026-06-10 (sandbox round-trip completed via these exact paths).

Two **different Amazon accounts** are involved. Provisioning (requester) and
working (worker) never share credentials, and neither uses "account ID +
username" login — Amazon properties here use email-based retail logins or
IAM API keys.

## 1. Provisioning / Requester side (creates HITs, lists assignments, approves)

| Item | Value |
|---|---|
| Access method | AWS API (SigV4) — `aws mturk` CLI / AWS SDK. No browser login involved. |
| AWS account | `181596276354` |
| IAM credential | Access key `AKIASUR73I2B…` — 1Password item **"AWS - DallasCrilley - AI-Agents User"** (Private vault) |
| Where it lives | `.env` (`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`) of the bridge checkouts on **Bux** (`bux-cmd`, 178.156.212.16): `~/Code/ai-human-review-broker-agent-loop/.env` (live stack :3200 broker / :3300 bridge) and `~/Code/ai-human-review-broker-mturk-staging/.env` (old :3000/:3100 stack, stopped) |
| Endpoint | `MTURK_AWS_ENDPOINT_URL=https://mturk-requester-sandbox.us-east-1.amazonaws.com` (sandbox, default), region `us-east-1`. Production: `https://mturk-requester.us-east-1.amazonaws.com` — the bridge refuses it unless `MTURK_ALLOW_PRODUCTION=true` (paid HITs; see `bux-mturk-runbook.md` "Paid production run") |
| Requester portal (browser, rarely needed) | Sandbox: https://requestersandbox.mturk.com · Production: use **https://requester.mturk.com/begin_aws_signin** (creates/links prod MTurk to AWS `181596276354`) — **not** bare AWS sign-in on the homepage (that 403s or shows "no MTurk account"). Signs in with **AWS root** `dallas@dallascrilley.com` (passkey MFA required once). IAM users cannot use the portal. After link: AWS Billing (not prepaid card); if `create-hit` returns insufficient funds with `$0.02` balance, add a payment method in AWS Billing and request Mechanical Turk monthly usage in Service Quotas. Prod env overlay: `docs/ops/env.production.example`. Local helper: `bash scripts/ops/mturk-prod-aws-link.sh` (opens headed browser through MFA). Bux verify: `AWS_DEFAULT_REGION=us-east-1 aws mturk get-account-balance --endpoint-url https://mturk-requester.us-east-1.amazonaws.com` (with agent-loop `.env` sourced). |

**Important: this Mac cannot provision.** The local `~/.aws` default profile is
a *different* AWS account (`221909913867`, `project-unify-admin-services`),
which is not linked to an MTurk requester account — `aws mturk` here fails
with `AWS.AccountNotLinked`. All requester-side AWS calls
(`list-assignments-for-hit`, `approve-assignment`, `validate:mturk-phase6`)
must run on Bux, where the linked account's keys are in the bridge `.env`.
Note `aws` CLI is not installed on Bux's interactive shell; the bridge invokes
it via its own runtime/PATH — source the checkout's `.env` + use its tooling.

The requester display name workers see is **"Dallas Crilley QA Sandbox"**.

## 2. Worker side (accepts and submits HITs in the Developer Sandbox)

| Item | Value |
|---|---|
| Access method | Browser login at https://workersandbox.mturk.com/ — Amazon **retail** account, email + password (passkey also registered, but only usable in a real browser with Touch ID) |
| Amazon account | `dallasdotjs@gmail.com` (Dallas's personal Prime account — same password as personal Amazon) |
| Worker ID | `ASBEMCXX9AKTR` |
| Credential | 1Password item **"MTurk Worker Sandbox - dallasdotjs@gmail.com"** (Private vault, secure note — now includes the verified password) |

### Agent login procedure (unattended, no Touch ID)

```bash
export AGENT_BROWSER_SESSION_NAME=mturk-worker   # persistent named session
agent-browser open https://workersandbox.mturk.com/
agent-browser snapshot                            # if already signed in, you land on HIT groups
# else: fill email -> Continue -> fill password (op read from the 1P note) ->
#       check "Keep me signed in" -> focus password field -> press Enter
#       (clicking the Sign in button does NOT submit; use Enter)
```

Session cookies auto-save/restore under the `mturk-worker` session name, so
subsequent runs usually skip login entirely. Find our HITs by searching
**"AI Broker UI Verification"** (the `MTURK_TITLE_PREFIX`).

Gotchas observed:
- The "Sign in with a passkey" button is disabled in headless Chromium (no
  WebAuthn authenticator) — password is the only headless path.
- HIT forms render inside an iframe; `agent-browser snapshot` exposes the
  iframe contents with refs, and `click`/`fill`/`select` work on them directly.

## 3. Why they must be different accounts

MTurk requires requester and worker to be distinct identities; in the sandbox
we control both. Provisioning identity = AWS IAM key in account
`181596276354` (linked to the MTurk requester). Worker identity = the
`dallasdotjs@gmail.com` retail account. The Mac's local AWS profile
(`221909913867`) is a third, unrelated identity and plays no MTurk role.

## 4. Bridge/broker auth (for completeness)

- Bridge `GET /state` etc. on Bux :3300 requires `Authorization: Bearer
  $MTURK_BRIDGE_API_KEY` (from the checkout's `.env`). `x-api-key` is rejected.
- Broker on Bux :3200 uses `RUNTIME_OPERATOR_TOKEN` from the same `.env`.
