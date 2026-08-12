import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

import {
  BrokerClient,
  type Criticality,
  type GateCheckResult,
  type GateCriterion
} from "./lib/broker-gate.js";

/**
 * Dev-workflow gate: run this repo's own quality checks, route their pass/fail
 * outcomes through the broker's self-verification lifecycle, and exit non-zero
 * unless the broker returns an "allow" release gate. Same command runs locally
 * (`npm run verify`) and in CI. Set BROKER_URL to record the verdict in a
 * deployed broker instead of the ephemeral in-process runtime.
 *
 * Usage: tsx scripts/verify-change.ts [check ...]   (default: lint build test)
 */

type Check = {
  id: string;
  criticality: Criticality;
  description: string;
  command: string[];
};

const CHECKS: Check[] = [
  {
    id: "lint",
    criticality: "major",
    description: "Lint passes (eslint .)",
    command: ["npm", "run", "lint"]
  },
  {
    id: "build",
    criticality: "critical",
    description: "Type-check passes (tsc --noEmit)",
    command: ["npm", "run", "build"]
  },
  {
    id: "test",
    criticality: "critical",
    description: "Test suite passes (vitest run)",
    command: ["npm", "test"]
  }
];

function git(args: string[]): string {
  const res = spawnSync("git", args, { encoding: "utf8" });
  return res.status === 0 ? res.stdout.trim() : "";
}

function runCheck(check: Check): {
  result: GateCheckResult;
  passed: boolean;
  output: string;
} {
  const [command, ...args] = check.command;
  const res = spawnSync(command, args, { encoding: "utf8" });
  const output = `${res.stdout ?? ""}${res.stderr ?? ""}`;
  const passed = res.status === 0;
  // Dogfood knob: VERIFY_FORCE_HUMAN_REVIEW=true reports failures as
  // "unclear" so the gate exercises the full HITL escalation (sim provider
  // locally, a deployed provider when PROVIDER_ENABLED). Default keeps hard failures
  // machine-resolved so the gate cannot be greenwashed by the simulator.
  const escalateFailures = process.env.VERIFY_FORCE_HUMAN_REVIEW === "true";
  const evidenceHash = createHash("sha256")
    .update(output)
    .digest("hex")
    .slice(0, 32);
  return {
    passed,
    output,
    result: {
      criterionId: check.id,
      status: passed ? "pass" : escalateFailures ? "unclear" : "fail",
      confidence: passed ? "high" : escalateFailures ? "low" : "high",
      evidenceHash,
      failureCategories: passed ? [] : [`${check.id}-failed`]
    }
  };
}

async function main(): Promise<void> {
  const requested = process.argv.slice(2);
  const selected = requested.length
    ? CHECKS.filter((check) => requested.includes(check.id))
    : CHECKS;

  if (!selected.length) {
    console.error(
      `No matching checks. Available: ${CHECKS.map((c) => c.id).join(", ")}`
    );
    process.exit(2);
  }

  const repository =
    git(["rev-parse", "--show-toplevel"]).split("/").pop() ??
    "quorum";
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]) || undefined;
  const commit = git(["rev-parse", "HEAD"]) || "unknown";
  const runId = `${commit.slice(0, 12)}-${Date.now()}`;

  console.log(
    `broker gate · ${repository}@${commit.slice(0, 8)}${branch ? ` (${branch})` : ""}`
  );
  console.log(`checks: ${selected.map((c) => c.id).join(", ")}\n`);

  const criteria: GateCriterion[] = [];
  const results: GateCheckResult[] = [];
  for (const check of selected) {
    process.stdout.write(`  running ${check.id} … `);
    const { result, passed, output } = runCheck(check);
    console.log(passed ? "pass" : "FAIL");
    if (!passed) {
      console.log(
        output
          .trimEnd()
          .split("\n")
          .slice(-20)
          .map((line) => `    ${line}`)
          .join("\n")
      );
    }
    criteria.push({
      criterionId: check.id,
      criticality: check.criticality,
      humanVisibleText: check.description,
      evidenceRequirements: ["console_summary"]
    });
    results.push(result);
  }

  const client = await BrokerClient.connect();
  try {
    const { jobId, verdict, feedback } = await client.runSelfVerificationGate({
      runId,
      source: {
        repository,
        branch,
        commit,
        environment: "ci",
        route: "/verify"
      },
      criteria,
      results
    });

    console.log(
      `\nbroker verdict: ${verdict.final_verdict} → ${verdict.release_gate_effect}`
    );
    console.log(`  job: ${jobId}  verdict: ${verdict.verdict_id}`);
    if (feedback && feedback.failed_criteria.length) {
      console.log(`  failed criteria: ${feedback.failed_criteria.join(", ")}`);
      if (feedback.repair_hint) {
        console.log(`  repair hint: ${feedback.repair_hint}`);
      }
    }

    process.exit(verdict.release_gate_effect === "allow" ? 0 : 1);
  } finally {
    await client.close();
  }
}

void main();
