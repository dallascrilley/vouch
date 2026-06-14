# Agent-native audit epic (td-95dc1a)

Source: ce-agent-native-audit 2026-06-14. Tracker epic `td-95dc1a` with 10 child issues.

## Units

1. P0 discovery/context — CLI `--help`, README agent section, AGENTS.md bootstrap
2. P1 contracts/client/ops — OpenAPI extensions, unified `broker-client.ts`, `--status`, metrics endpoint
3. P2 agent surface — MCP primitive server, rubric envelope params, stuck-state on poll timeout

## Verification

- `npm test`
- `npm run review -- --help`
- `script/cibuild` (CI gate)
