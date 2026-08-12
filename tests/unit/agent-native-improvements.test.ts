import { describe, expect, it } from "vitest";

import { BrokerClient } from "../../scripts/lib/broker-gate.js";
import { printReviewCliHelp } from "../../scripts/lib/review-cli-help.js";
import {
  normalizeStructuredAnswers,
  type StructuredTaskTemplate
} from "../../scripts/lib/review-templates.js";
import { buildApp } from "../../src/api/app.js";

describe("agent-native improvements", () => {
  it("prints review CLI help", () => {
    const chunks: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: string | Uint8Array) => {
      chunks.push(String(chunk));
      return true;
    };
    try {
      printReviewCliHelp();
    } finally {
      process.stdout.write = original;
    }
    const text = chunks.join("");
    expect(text).toContain("binary_screenshot_check");
    expect(text).toContain("Exit codes");
    expect(text).toContain("dev:worker");
  });

  it("honors rubric pass_min and fail_max envelope params", () => {
    const envelope: StructuredTaskTemplate = {
      instructions: "Rate the copy.",
      params: {
        content: "Hello world",
        criteria: [{ id: "clarity", statement: "The copy is clear." }],
        fail_max: 1,
        pass_min: 5
      },
      template_id: "text_quality_rubric",
      v: 1
    };
    const fields = new Map<string, string>([
      ["criterion_0_answer", "5"],
      ["confidence", "high"],
      ["evidence_note", "Reads clearly with no jargon."]
    ]);
    const passResult = normalizeStructuredAnswers({
      criterionIds: ["clarity"],
      envelope,
      fields
    });
    expect(passResult.overall_verdict).toBe("pass");

    fields.set("criterion_0_answer", "1");
    const failResult = normalizeStructuredAnswers({
      criterionIds: ["clarity"],
      envelope,
      fields: new Map(fields)
    });
    expect(failResult.overall_verdict).toBe("fail");
  });

  it("exposes runtime metrics via operator inspection route", async () => {
    const app = buildApp();
    await app.ready();
    const health = await app.inject({ method: "GET", url: "/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({
      docs_url: "docs/architecture/agent-loop-integration.md",
      status: "ok"
    });

    await app.inject({
      method: "GET",
      url: "/verification-jobs/job-metrics-test/feedback"
    });
    const metrics = await app.inject({
      method: "GET",
      url: "/runtime/metrics"
    });
    expect(metrics.statusCode).toBe(200);
    const body: { increments: Array<{ name: string }> } = metrics.json();
    expect(
      body.increments.some((entry) => entry.name === "broker.health.requests")
    ).toBe(true);
    await app.close();
  });

  it("BrokerClient exposes primitive getJob", async () => {
    const client = await BrokerClient.connect();
    const gate = await client.runSelfVerificationGate({
      criteria: [
        {
          criterionId: "lint",
          criticality: "major",
          evidenceRequirements: ["console"],
          humanVisibleText: "Lint passes"
        }
      ],
      results: [
        {
          confidence: "high",
          criterionId: "lint",
          evidenceHash: "abc123",
          status: "pass"
        }
      ],
      runId: "broker-client-primitive-test",
      source: {
        commit: "test",
        environment: "test",
        repository: "test",
        route: "/"
      }
    });
    const job = await client.getJob(gate.jobId);
    expect(job).toMatchObject({ job_id: gate.jobId });
    await client.close();
  });
});
