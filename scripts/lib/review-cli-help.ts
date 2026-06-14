import { REVIEW_TEMPLATE_IDS } from "./review-templates.js";

export function printReviewCliHelp(): void {
  process.stdout.write(`npm run review — commission human review via the broker

Prerequisites:
  - Broker API running (npm run dev or BROKER_URL)
  - Dispatch worker running (npm run dev:worker) for provider dispatch

Usage:
  npm run review -- [options]

Templates (${REVIEW_TEMPLATE_IDS.join(", ")}):
  binary_screenshot_check       Yes/No visual QA on a screenshot
  pairwise_screenshot_compare   A/B compare two screenshots
  text_quality_rubric           1–5 rating per rubric statement
  data_extraction_check         Correct/Incorrect field checks
  instruction_following_check   Spec + output compliance

Common options:
  --template <id>               Survey template (default: binary_screenshot_check)
  --question "id:statement"     Criterion (repeatable; required for most templates)
  --screenshot <path>             Screenshot for visual templates
  --risk low|medium|high          Worker count / pricing preset (default: medium)
  --wait                          Block until agent_next_action (default when not --no-wait)
  --no-wait                       Return job ids immediately after commissioning
  --resume <job_id>               Poll feedback for an existing job
  --status <job_id>               Print job state and optional feedback peek
  --estimate                      Print pricing estimate only; no dispatch
  --broker-url <url>              Broker base URL (default: BROKER_BASE_URL or http://127.0.0.1:3000)
  --poll-seconds <n>              Initial feedback poll interval
  --timeout-seconds <n>           Max wait for feedback (default: 1800)

Exit codes (agent_next_action):
  0 pass    1 fail    2 retry    3 recapture    4 escalate    5 pending/timeout

stdout: single JSON object (job_id, feedback, agent_next_action, …)

Docs: docs/architecture/agent-loop-integration.md
OpenAPI: specs/001-verification-control-plane/contracts/openapi.yaml
`);
}
