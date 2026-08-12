# Security policy

## Reporting a vulnerability

Report suspected vulnerabilities privately through
[GitHub Security Advisories](https://github.com/dallascrilley/quorum-private/security/advisories/new),
or by email to dallas@dallascrilley.com. Please do not open a public issue for
a security problem.

Include the affected version or commit, the impact you believe it has, and the
steps to reproduce it. I will acknowledge within seven days and tell you
whether the report is accepted, along with a rough timeline for a fix.

## Supported versions

This project is pre-1.0. Only the default branch receives security fixes.

## Security-relevant configuration

Vouch handles artifacts that may contain sensitive material, so a few settings
are not optional in a real deployment:

| Variable                                                               | Why it matters                                                                                                                           |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `RUNTIME_OPERATOR_TOKEN`                                               | Bearer token for the runtime inspection and operations endpoints. Without it those endpoints refuse to serve rather than serving openly. |
| `PROVIDER_SHARED_SECRET`                                               | Validates provider callbacks. An unvalidated callback endpoint lets anyone inject reviewer responses and forge a verdict.                |
| `PROVIDER_API_KEY`                                                     | Credential for the outbound provider adapter.                                                                                            |
| `RUNTIME_SQLITE_PATH`, `PROVIDER_SQLITE_PATH`, `RUNTIME_ARTIFACT_ROOT` | Local state and artifact paths. Treat them as sensitive storage; they hold evidence packages.                                            |

Never commit `.env` files or real provider credentials. `.gitignore` excludes
`.env*`; keep local validation logs and captured artifacts out of the
repository as well.

## Privacy model

Evidence is classified before anything leaves the process. Material classified
as secret, regulated, or failed-redaction fails closed rather than routing to
external review. The threat model is documented in
[docs/security/privacy-gate-threat-model.md](docs/security/privacy-gate-threat-model.md),
local data handling in
[docs/security/local-runtime-data-handling.md](docs/security/local-runtime-data-handling.md),
and provider secret handling in
[docs/security/provider-secret-handling.md](docs/security/provider-secret-handling.md).
