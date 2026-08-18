# Agent Loop Integration

How any agentic loop or dev workflow commissions an MTurk human review with one
call, and how survey templates keep that review cheap and high-signal.

This document extends `agent-review-contract.md` (the wire contract) with the
integration layer that makes the contract usable from a shell one-liner, and
the structured task-template envelope that the MTurk bridge renders into
optimized HITs.

## Goals

1. **One call per review.** An agent should not orchestrate the four
   commissioning endpoints and a feedback poll by hand. It runs one command (or
   one library call) and blocks until it has an `agent_next_action`.
2. **Zero broker-core changes.** The broker already treats `task_template` as
   an opaque string that flows verbatim from the agent through
   `POST /verification-jobs/:jobId/human-review-tasks` to the provider bridge.
   The integration layer lives entirely in the client and the bridge.
3. **Cost-optimal, signal-optimal surveys.** Replace the generic worker form
   (overall verdict + severity + defect category + per-criterion verdict +
   per-criterion confidence + note + flags) with per-scenario templates that
   ask only the questions a worker can answer reliably, and derive the rest.

## The one-call integration

```
npm run review -- \
  --template binary_screenshot_check \
  --question "hero-cta-no-overlap:The orange CTA does not overlap the hero headline at 1440x900." \
  --screenshot .runtime/shots/hero.png \
  --risk medium \
  --wait
```

Exit code communicates the decision so any loop can branch on it without
parsing output:

| Exit | `agent_next_action` | Meaning for the loop                          |
| ---- | ------------------- | --------------------------------------------- |
| 0    | `pass`              | proceed / release                             |
| 1    | `fail`              | stop; do not retry                            |
| 2    | `retry`             | rerun the repair loop using `failed_criteria` |
| 3    | `recapture`         | collect better evidence, then resubmit        |
| 4    | `escalate`          | hand off to an operator                       |
| 5    | (timeout / pending) | verdict not ready; job ids printed for resume |

stdout is a single JSON object (`job_id`, `review_task_id`,
`provider_task_id`, `agent_next_action`, `failed_criteria`, `repair_hint`,
`estimated_cost_usd`, ...) so richer consumers parse instead of branching.

Under the hood the client (`scripts/lib/agent-review-client.ts`) performs the
existing contract steps and nothing new:

```
POST /verification-jobs                       (criteria, budget, risk, agent_run_id)
POST /verification-jobs/:id/artifacts          (screenshot manifest + sanitized package)
POST /verification-jobs/:id/privacy-classification
POST /verification-jobs/:id/human-review-tasks (structured task_template envelope)
GET  /verification-jobs/:id/feedback           (poll w/ backoff until agent_next_action)
```

The broker remains the system of record: budget caps, privacy gating,
consensus, adjudication, ledger, and the signed release artifact all behave
exactly as before.

### Integration recipes

**Generic bash gate (any agent harness, CI step, git hook):**

```bash
if npm run -s review -- --template binary_screenshot_check \
     --question "checkout-total-visible:The order total is visible above the fold." \
     --screenshot artifacts/checkout.png --risk high --wait; then
  echo "human review passed"
else
  case $? in
    2|3) retry_with_feedback ;;   # feedback JSON was printed on stdout
    *)   exit 1 ;;
  esac
fi
```

**Agentic loop (Claude Code / Codex / any tool-running agent):** the agent
runs the same command as a shell tool call. Because the command blocks and the
verdict is in the exit code + stdout JSON, no harness-specific adapter is
needed. For long-running reviews, `--no-wait` returns ids immediately and
`--resume <job_id>` re-attaches to poll later.

**TypeScript callers (test suites, custom gates):**

```ts
import { requestHumanReview } from "./scripts/lib/agent-review-client.js";

const review = await requestHumanReview({
  brokerBaseUrl: process.env.BROKER_BASE_URL ?? "http://127.0.0.1:3000",
  template: {
    v: 1,
    template_id: "binary_screenshot_check",
    instructions: "Check the screenshot against each statement.",
    params: {
      criteria: [
        {
          id: "hero-cta-no-overlap",
          statement: "The orange CTA does not overlap the hero headline."
        }
      ]
    }
  },
  criteria: [
    {
      criterionId: "hero-cta-no-overlap",
      humanVisibleText: "The orange CTA does not overlap the hero headline.",
      criticality: "major"
    }
  ],
  screenshot: { path: ".runtime/shots/hero.png" },
  riskTier: "medium",
  waitForFeedback: true
});
if (review.feedback?.agent_next_action !== "pass") {
  /* branch on review.feedback */
}
```

### Privacy

The client defaults to `data_class: internal_low` /
`externalization_decision: allowed` because sending a screenshot to public
crowd workers _is_ externalization. Callers reviewing anything user-derived
must pass `--data-class` honestly; the broker's privacy gate still blocks
externalization for restricted classes regardless of what the client asks for.
The go-live grant, dispatch-time recompute, and health proof are documented in
[`privacy-gate.md`](privacy-gate.md).

## Structured task-template envelope

`task_template` stays a string end-to-end. The bridge now distinguishes two
forms:

- **Legacy text** — rendered as before (free-text instruction + the generic
  form). Anything that does not parse as the envelope below is legacy text.
- **Structured envelope** — a JSON object with a version tag. Invalid or
  unknown-versioned envelopes are rejected at `/dispatch` with `400` rather
  than shown to workers as raw JSON.

```jsonc
{
  "v": 1,
  "template_id": "binary_screenshot_check",
  "instructions": "Check the screenshot against each statement.",
  "params": {
    /* template-specific, see catalog */
  },
  "pricing": { "reward": "0.08", "max_assignments": 3 },
  "attention_check": {
    "prompt": "To show you read these instructions, select \"No\" for this row.",
    "expected": "fail"
  },
  "default_severity": "S2"
}
```

- `pricing` overrides the bridge-wide `MTURK_REWARD` / `MTURK_MAX_ASSIGNMENTS`
  per HIT. Overrides are validated against the same safety rails
  (`MTURK_MAX_REWARD_USD`, `MTURK_MAX_ASSIGNMENTS_PER_HIT`,
  `MTURK_MAX_SPEND_PER_HIT_USD`); violations reject the dispatch. The bridge
  also uses `max_assignments` as the per-task expected delivery count, so
  `deliveryComplete` no longer assumes the global default. The broker spend
  ceiling uses the same `pricing` object (`reward * max_assignments`); without
  it, a configured `VOUCH_REAL_SPEND_CEILING_USD` blocks real dispatch. See
  [`docs/ops/spend-ceiling.md`](../ops/spend-ceiling.md).
- `attention_check` renders one extra row visually identical to the real
  questions with a stated correct answer. Responses that fail it are still
  delivered (consensus owns weighting) but carry the
  `attention_check_failed` quality flag.
- The broker never parses the envelope; only the client builds it and the
  bridge consumes it. Other provider bridges may define their own structured
  interpretations or treat it as text.
- **Size budget (learned from a real sandbox rejection):** AWS caps the
  CreateHIT Question parameter at 131,072 characters, and inline screenshot
  data URLs dominate it. The client rejects screenshots whose data URL would
  exceed `MAX_VISUAL_DATA_URL_CHARS` (110,000 — re-encode as JPEG ≤ ~80KB;
  pairwise variants share the budget), and the bridge returns `400` before
  calling AWS if the rendered QuestionXML is over the hard limit.

## Survey template catalog

Why templates at all: the generic form asks every worker for an overall
verdict, a severity, a defect category, a per-criterion verdict, a
per-criterion confidence, an evidence note, and quality flags — for every
task, even a 10-second binary check. Most of those fields are noise from a
crowd worker (severity taxonomy, defect category) and each extra field costs
seconds, which either raises the fair reward or degrades answer quality.

Design rules applied to every template:

1. **Ask only perception questions.** Workers report what they see; the
   normalizer derives `overall_verdict`, `severity`, and `defect_category`
   from the template config and the per-criterion answers.
2. **Forced choice, no defaults.** Radios start unselected and are `required`;
   there is no "looks fine" path of least resistance.
3. **Always offer an honest out.** Every question includes "can't tell", which
   maps to `not_visible` and routes the job toward `recapture` /
   `artifact_insufficient` instead of polluting pass/fail.
4. **One required rationale, with a floor.** A single note field with
   `minlength` forces a real sentence — the cheapest spam filter and the best
   audit artifact — instead of per-question essays.
5. **One confidence question total.** Applied to all criterion results.
   Per-criterion confidence sliders add time, not signal.
6. **Attention checks where stakes justify them.** Recommended for
   `max_assignments >= 3` or high risk.
7. **Pay a fair effective wage.** Rewards target ≥ ~$12/hour for the estimated
   completion time. Underpaying selects for the fastest, least careful
   workers; it is a signal decision, not only an ethical one.

### Templates

| `template_id`                 | Scenario                                                                 | Worker answers per criterion                | Est. time |
| ----------------------------- | ------------------------------------------------------------------------ | ------------------------------------------- | --------- |
| `binary_screenshot_check`     | "Is this UI state correct?" — visual QA, regression checks               | Yes / No / Can't tell                       | ~25s      |
| `pairwise_screenshot_compare` | Candidate vs baseline — "did the change make it better?", A/B judgment   | A / B / Tie / Can't tell (order randomized) | ~35s      |
| `text_quality_rubric`         | Copy, summaries, generated text rated against rubric statements          | 1–5 rating per rubric statement             | ~45s      |
| `data_extraction_check`       | Extracted/structured values vs source screenshot                         | Correct / Incorrect / Not visible per field | ~30s      |
| `instruction_following_check` | "Does this output satisfy these instructions?" — generic LLM-output gate | Yes / No / Can't tell                       | ~50s      |

Normalization (bridge-side, per template):

- `binary_screenshot_check`, `instruction_following_check`: Yes → `pass`,
  No → `fail`, Can't tell → `not_visible`.
- `pairwise_screenshot_compare`: `params.variant_a` / `params.variant_b` carry
  `{ data_url, caption }` and `params.candidate` names which variant is the
  change under review. Candidate chosen → `pass`, other variant → `fail`,
  tie → `unclear`, can't tell → `not_visible`. Display order is shuffled
  deterministically from the review-task id to cancel position bias while
  staying reproducible.
- `text_quality_rubric`: rating ≥ 4 → `pass`, ≤ 2 → `fail`, 3 → `unclear`.
- `data_extraction_check`: `params.fields[]` pairs each criterion with a
  field name and the extracted value; Correct → `pass`, Incorrect → `fail`,
  Not visible → `not_visible`.
- Derived `overall_verdict`: any `fail` → `fail`; else any `not_visible` →
  `artifact_insufficient`; else any `unclear` → `unclear`; else `pass`.
- Derived `severity`: `default_severity` (default `S2`) when the overall
  verdict is `fail`, otherwise `S4`. Derived `defect_category`: the
  template id plus the first failed criterion.

### Pricing presets and cost model

MTurk charges a 20% fee on the reward (40% when `max_assignments >= 10` —
the presets never go there), minimum $0.01 fee per assignment.

`estimated cost = reward x max_assignments x 1.2`

Presets by risk tier (the CLI's `--risk` flag; overridable with `--reward` /
`--assignments`):

| Template                      | low (1 worker) | medium (3, majority) | high (5, majority) |
| ----------------------------- | -------------- | -------------------- | ------------------ |
| `binary_screenshot_check`     | $0.10 → $0.12  | $0.10×3 → $0.36      | $0.10×5 → $0.60    |
| `pairwise_screenshot_compare` | $0.12 → $0.14  | $0.12×3 → $0.43      | $0.12×5 → $0.72    |
| `text_quality_rubric`         | $0.15 → $0.18  | $0.15×3 → $0.54      | $0.15×5 → $0.90    |
| `data_extraction_check`       | $0.12 → $0.14  | $0.12×3 → $0.43      | $0.12×5 → $0.72    |
| `instruction_following_check` | $0.17 → $0.20  | $0.17×3 → $0.61      | $0.17×5 → $1.02    |

(First number is the per-assignment reward; the arrow shows total estimated
cost including the 20% fee.)

Guidance:

- **low**: reversible decisions where a wrong answer costs one retry. One
  worker, no attention check.
- **medium** (default): the broker's consensus layer gets a 3-vote majority;
  disagreement queues a priced pairwise micro-task (`pairwise_tie_break: true`,
  one assignment, inherited reward). That follow-up is not
  `pairwise_screenshot_compare`. See
  [`docs/ops/spend-ceiling.md`](../ops/spend-ceiling.md).
- **high**: release gates and `critical` criteria. Five votes plus an
  attention check; combine with qualification requirements
  (`MTURK_QUALIFICATION_REQUIREMENTS_JSON`, e.g. ≥ 98% approval and ≥ 1000
  approved HITs) on the bridge.

Budget interplay: the client sets the job's `budget_policy.maxAssignments`
and `maxJobCost` from the chosen preset so the broker-side budget gate and
the bridge-side safety rails agree.

## What was deliberately not built

- **No new broker endpoint.** A `POST /quick-verify` convenience route would
  duplicate orchestration the client already does, and would push template
  knowledge into the core that is provider-specific by design.
- **No per-job qualification overrides.** Qualifications stay bridge-wide
  config; per-dispatch qualifications widen the attack surface of the
  dispatch API for marginal benefit. Revisit if multiple pools per bridge
  become real.
- **No webhook back to the agent.** Polling with backoff is adequate at this
  latency class (minutes-to-hours); agents that cannot hold a process open
  use `--no-wait` + `--resume`.

## File map

| Path                                             | Role                                                                                                      |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `scripts/lib/review-templates.ts`                | Envelope types/parsing, template catalog, render + normalize, pricing presets, cost estimator             |
| `scripts/lib/agent-review-client.ts`             | `requestHumanReview()` — commissioning + feedback polling                                                 |
| `scripts/request-review.ts`                      | CLI (`npm run review`)                                                                                    |
| `scripts/lib/mturk-bridge.ts`                    | Envelope-aware `buildHtmlQuestion` / `normalizeAssignment`, pricing clamps, HIT recovery assignment count |
| `scripts/mturk-bridge.ts`                        | `/dispatch` envelope validation, per-HIT pricing, per-task expected assignment count                      |
| `tests/contract/review-template-catalog.test.ts` | Envelope/render/normalize/pricing contract                                                                |
| `tests/integration/agent-review-client.test.ts`  | One-call flow against a live broker app + stub bridge                                                     |
