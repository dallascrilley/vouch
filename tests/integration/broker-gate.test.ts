import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  BrokerClient,
  type GateCheckResult,
  type GateCriterion
} from "../../scripts/lib/broker-gate.js";

const source = {
  repository: "quorum",
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

  it("allows the release gate and writes a signed release artifact when every check passes", async () => {
    const artifactDir = mkdtempSync(join(tmpdir(), "verify-verdict-"));
    const artifactPath = join(artifactDir, "verify-verdict.json");
    try {
      client = await BrokerClient.connect();
      const { verdict, releaseArtifact } = await client.runSelfVerificationGate(
        {
          runId: "gate-pass",
          source,
          criteria,
          results: [result("lint", true), result("test", true)],
          releaseArtifactPath: artifactPath
        }
      );

      expect(verdict.final_verdict).toBe("pass");
      expect(verdict.release_gate_effect).toBe("allow");
      expect(releaseArtifact).toMatchObject({
        final_verdict: "pass",
        release_gate_effect: "allow"
      });
      expect(releaseArtifact?.signature).toMatch(/^[0-9a-f]{64}$/);
      expect(existsSync(artifactPath)).toBe(true);
      expect(JSON.parse(readFileSync(artifactPath, "utf8"))).toEqual(
        releaseArtifact
      );
    } finally {
      rmSync(artifactDir, { force: true, recursive: true });
    }
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
