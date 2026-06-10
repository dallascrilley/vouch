import { afterEach, describe, expect, it } from "vitest";

import {
  BrokerClient,
  type GateCheckResult,
  type GateCriterion
} from "../../scripts/lib/broker-gate.js";

const source = {
  repository: "ai-human-review-broker",
  branch: "test",
  commit: "deadbeefcafe",
  environment: "ci",
  route: "/verify"
};

const criteria: GateCriterion[] = [
  {
    criterionId: "lint",
    criticality: "major",
    humanVisibleText: "Lint passes",
    evidenceRequirements: ["console_summary"]
  },
  {
    criterionId: "test",
    criticality: "critical",
    humanVisibleText: "Tests pass",
    evidenceRequirements: ["console_summary"]
  }
];

function result(criterionId: string, pass: boolean): GateCheckResult {
  return {
    criterionId,
    status: pass ? "pass" : "fail",
    confidence: "high",
    evidenceHash: `hash-${criterionId}`,
    failureCategories: pass ? [] : [`${criterionId}-failed`]
  };
}

describe("broker dev-workflow gate", () => {
  let client: BrokerClient;

  afterEach(async () => {
    await client.close();
  });

  it("allows the release gate when every check passes", async () => {
    client = await BrokerClient.connect();
    const { verdict } = await client.runSelfVerificationGate({
      runId: "gate-pass",
      source,
      criteria,
      results: [result("lint", true), result("test", true)]
    });

    expect(verdict.final_verdict).toBe("pass");
    expect(verdict.release_gate_effect).toBe("allow");
  });

  it("blocks the release gate and reports the failing criterion", async () => {
    client = await BrokerClient.connect();
    const { verdict, feedback } = await client.runSelfVerificationGate({
      runId: "gate-fail",
      source,
      criteria,
      results: [result("lint", true), result("test", false)]
    });

    expect(verdict.final_verdict).toBe("fail");
    expect(verdict.release_gate_effect).toBe("block");
    expect(feedback?.failed_criteria).toContain("test");
  });

  it("escalates unresolved checks to human review and resolves via the simulated provider", async () => {
    client = await BrokerClient.connect();
    const { verdict, feedback } = await client.runSelfVerificationGate({
      runId: "gate-hitl",
      source,
      criteria,
      results: [
        result("lint", true),
        {
          criterionId: "test",
          status: "unclear",
          confidence: "low",
          evidenceHash: "hash-test-unclear",
          failureCategories: ["test-ambiguous"]
        }
      ]
    });

    expect(verdict.final_verdict).toBe("pass");
    expect(verdict.release_gate_effect).toBe("allow");
    expect(feedback?.final_verdict).toBe("pass");
  });
});
