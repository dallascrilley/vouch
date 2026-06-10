import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { screenshotToVisualEvidence } from "../../scripts/lib/agent-review-client.js";
import {
  buildHtmlQuestion,
  normalizeAssignment,
  resolveDispatchPricing
} from "../../scripts/lib/mturk-bridge.js";
import {
  buildStructuredTaskTemplate,
  estimateTemplateCost,
  MAX_VISUAL_DATA_URL_CHARS,
  normalizeStructuredAnswers,
  parseTaskTemplate,
  recommendedPricing,
  type StructuredTaskTemplate
} from "../../scripts/lib/review-templates.js";

const binaryEnvelope: StructuredTaskTemplate = {
  instructions: "Look at the screenshot and answer each question.",
  params: {
    criteria: [
      {
        id: "hero-cta-no-overlap",
        statement: "The orange CTA does not overlap the hero headline."
      },
      {
        id: "footer-visible",
        statement: "The footer links are visible."
      }
    ]
  },
  template_id: "binary_screenshot_check",
  v: 1
};

const pairwiseEnvelope: StructuredTaskTemplate = {
  instructions: "Compare the two versions.",
  params: {
    candidate: "b",
    criteria: [
      { id: "layout-improved", statement: "The layout looks cleaner." }
    ],
    variant_a: { caption: "Baseline", data_url: "data:image/png;base64,AAA" },
    variant_b: { caption: "Candidate", data_url: "data:image/png;base64,BBB" }
  },
  template_id: "pairwise_screenshot_compare",
  v: 1
};

function answerXml(fields: Record<string, string>) {
  const answers = Object.entries(fields)
    .map(
      ([identifier, value]) =>
        `<Answer><QuestionIdentifier>${identifier}</QuestionIdentifier><FreeText>${value}</FreeText></Answer>`
    )
    .join("");
  return `<QuestionFormAnswers>${answers}</QuestionFormAnswers>`;
}

describe("task template envelope", () => {
  it("treats free text as a legacy template", () => {
    const parsed = parseTaskTemplate("Review the embedded screenshot.");
    expect(parsed).toEqual({
      kind: "legacy",
      text: "Review the embedded screenshot."
    });
  });

  it("parses a valid structured envelope", () => {
    const parsed = parseTaskTemplate(
      buildStructuredTaskTemplate(binaryEnvelope)
    );
    expect(parsed.kind).toBe("structured");
    if (parsed.kind === "structured") {
      expect(parsed.envelope.template_id).toBe("binary_screenshot_check");
    }
  });

  it("rejects a JSON object that is not a valid envelope", () => {
    expect(() =>
      parseTaskTemplate(JSON.stringify({ template_id: "nope", v: 1 }))
    ).toThrowError(/template_id/);
  });

  it("rejects an attention check whose expected answer is not an option", () => {
    expect(() =>
      buildStructuredTaskTemplate({
        ...binaryEnvelope,
        attention_check: { expected: "maybe", prompt: "Select No." }
      })
    ).toThrowError(/attention_check.expected/);
  });

  it("rejects pairwise variants whose combined data URLs exceed the QuestionXML budget", () => {
    const oversized = `data:image/jpeg;base64,${"A".repeat(MAX_VISUAL_DATA_URL_CHARS / 2 + 100)}`;
    expect(() =>
      buildStructuredTaskTemplate({
        ...pairwiseEnvelope,
        params: {
          ...pairwiseEnvelope.params,
          variant_a: { caption: "Baseline", data_url: oversized },
          variant_b: { caption: "Candidate", data_url: oversized }
        }
      })
    ).toThrowError(/QuestionXML limit/);
  });
});

describe("screenshot size guard", () => {
  it("rejects screenshots whose data URL would exceed the QuestionXML budget", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "review-template-guard-"));
    try {
      const oversizedPath = join(tempDir, "huge.png");
      writeFileSync(
        oversizedPath,
        Buffer.alloc(Math.ceil((MAX_VISUAL_DATA_URL_CHARS * 3) / 4) + 1024)
      );
      expect(() =>
        screenshotToVisualEvidence({ path: oversizedPath })
      ).toThrowError(/QuestionXML budget/);
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });
});

describe("pricing presets and cost estimates", () => {
  it("scales assignments by risk tier", () => {
    expect(recommendedPricing("binary_screenshot_check", "low")).toEqual({
      max_assignments: 1,
      reward: "0.10"
    });
    expect(
      recommendedPricing("binary_screenshot_check", "medium").max_assignments
    ).toBe(3);
    expect(recommendedPricing("instruction_following_check", "high")).toEqual({
      max_assignments: 5,
      reward: "0.17"
    });
  });

  it("includes the 20% MTurk fee with a $0.01 floor", () => {
    expect(estimateTemplateCost({ max_assignments: 3, reward: "0.10" })).toBe(
      0.36
    );
    expect(estimateTemplateCost({ max_assignments: 1, reward: "0.03" })).toBe(
      0.04
    );
    expect(estimateTemplateCost({ max_assignments: 10, reward: "0.10" })).toBe(
      1.4
    );
  });
});

describe("resolveDispatchPricing", () => {
  const config = {
    maxAssignments: 1,
    maxAssignmentsPerHit: 3,
    maxRewardUsd: 1,
    maxSpendPerHitUsd: 3,
    reward: "0.05"
  };

  it("falls back to bridge defaults without envelope pricing", () => {
    expect(resolveDispatchPricing({ config })).toEqual({
      errors: [],
      maxAssignments: 1,
      reward: "0.05"
    });
  });

  it("applies envelope pricing inside the safety rails", () => {
    expect(
      resolveDispatchPricing({
        config,
        pricing: { max_assignments: 3, reward: "0.10" }
      })
    ).toEqual({ errors: [], maxAssignments: 3, reward: "0.10" });
  });

  it("rejects pricing outside the safety rails", () => {
    const result = resolveDispatchPricing({
      config,
      pricing: { max_assignments: 5, reward: "2.00" }
    });
    expect(result.errors).toEqual([
      expect.stringContaining("MTURK_MAX_REWARD_USD"),
      expect.stringContaining("MTURK_MAX_ASSIGNMENTS_PER_HIT"),
      expect.stringContaining("MTURK_MAX_SPEND_PER_HIT_USD")
    ]);
  });
});

describe("structured HIT rendering", () => {
  it("renders questions without the legacy severity/verdict fields", () => {
    const html = buildHtmlQuestion({
      criterionIds: ["hero-cta-no-overlap", "footer-visible"],
      reviewTaskId: "review-1",
      sandbox: true,
      taskTemplate: buildStructuredTaskTemplate(binaryEnvelope)
    });

    expect(html).toContain(
      "The orange CTA does not overlap the hero headline."
    );
    expect(html).toContain("Can&#39;t tell");
    expect(html).toContain('minlength="15"');
    expect(html).not.toContain('name="severity"');
    expect(html).not.toContain('name="overall_verdict"');
    expect(html).not.toContain('name="defect_category"');
  });

  it("keeps the legacy form for free-text templates", () => {
    const html = buildHtmlQuestion({
      criterionIds: ["check-1"],
      reviewTaskId: "review-2",
      sandbox: true,
      taskTemplate: "Review the embedded screenshot."
    });

    expect(html).toContain('name="overall_verdict"');
    expect(html).toContain('name="severity"');
  });

  it("escapes envelope content before rendering", () => {
    const html = buildHtmlQuestion({
      criterionIds: ["copy-quality"],
      reviewTaskId: "review-3",
      sandbox: true,
      taskTemplate: buildStructuredTaskTemplate({
        instructions: "Rate the text.",
        params: {
          content: '<script>alert("x")</script>',
          criteria: [{ id: "copy-quality", statement: "The copy is clear." }]
        },
        template_id: "text_quality_rubric",
        v: 1
      })
    });

    expect(html).not.toContain('<script>alert("x")</script>');
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("structured answer normalization", () => {
  it("derives verdict, severity, and defect category from per-criterion answers", () => {
    const result = normalizeStructuredAnswers({
      criterionIds: ["hero-cta-no-overlap", "footer-visible"],
      envelope: binaryEnvelope,
      fields: new Map([
        ["criterion_0_answer", "yes"],
        ["criterion_1_answer", "no"],
        ["confidence", "high"],
        ["evidence_note", "Footer links are cut off at the bottom."]
      ])
    });

    expect(result.criterion_results).toEqual([
      {
        confidence: "high",
        criterion_id: "hero-cta-no-overlap",
        status: "pass"
      },
      { confidence: "high", criterion_id: "footer-visible", status: "fail" }
    ]);
    expect(result.overall_verdict).toBe("fail");
    expect(result.severity).toBe("S2");
    expect(result.defect_category).toBe(
      "binary_screenshot_check:footer-visible"
    );
  });

  it("maps can't tell to artifact insufficiency, not failure", () => {
    const result = normalizeStructuredAnswers({
      criterionIds: ["hero-cta-no-overlap", "footer-visible"],
      envelope: binaryEnvelope,
      fields: new Map([
        ["criterion_0_answer", "yes"],
        ["criterion_1_answer", "cant_tell"],
        ["confidence", "low"]
      ])
    });

    expect(result.criterion_results[1].status).toBe("not_visible");
    expect(result.overall_verdict).toBe("artifact_insufficient");
    expect(result.severity).toBe("S4");
  });

  it("flags failed attention checks without dropping the response", () => {
    const result = normalizeStructuredAnswers({
      criterionIds: ["hero-cta-no-overlap", "footer-visible"],
      envelope: {
        ...binaryEnvelope,
        attention_check: { expected: "no", prompt: "Select No here." }
      },
      fields: new Map([
        ["attention_check_answer", "yes"],
        ["criterion_0_answer", "yes"],
        ["criterion_1_answer", "yes"]
      ])
    });

    expect(result.quality_flags).toEqual(["attention_check_failed"]);
    expect(result.overall_verdict).toBe("pass");
  });

  it("maps rubric ratings to pass/fail/unclear", () => {
    const envelope: StructuredTaskTemplate = {
      instructions: "Rate the text.",
      params: {
        content: "Example output",
        criteria: [
          { id: "clarity", statement: "The text is clear." },
          { id: "tone", statement: "The tone fits." },
          { id: "accuracy", statement: "The facts are right." }
        ]
      },
      template_id: "text_quality_rubric",
      v: 1
    };
    const result = normalizeStructuredAnswers({
      criterionIds: ["clarity", "tone", "accuracy"],
      envelope,
      fields: new Map([
        ["criterion_0_answer", "5"],
        ["criterion_1_answer", "3"],
        ["criterion_2_answer", "1"]
      ])
    });

    expect(result.criterion_results.map((entry) => entry.status)).toEqual([
      "pass",
      "unclear",
      "fail"
    ]);
  });

  it("maps pairwise answers relative to the candidate variant", () => {
    const fieldsFor = (answer: string) =>
      new Map([["criterion_0_answer", answer]]);

    expect(
      normalizeStructuredAnswers({
        criterionIds: ["layout-improved"],
        envelope: pairwiseEnvelope,
        fields: fieldsFor("b")
      }).criterion_results[0].status
    ).toBe("pass");
    expect(
      normalizeStructuredAnswers({
        criterionIds: ["layout-improved"],
        envelope: pairwiseEnvelope,
        fields: fieldsFor("a")
      }).criterion_results[0].status
    ).toBe("fail");
    expect(
      normalizeStructuredAnswers({
        criterionIds: ["layout-improved"],
        envelope: pairwiseEnvelope,
        fields: fieldsFor("tie")
      }).criterion_results[0].status
    ).toBe("unclear");
  });
});

describe("normalizeAssignment with structured templates", () => {
  it("produces a broker callback payload from MTurk answer XML", () => {
    const payload = normalizeAssignment({
      answerXml: answerXml({
        confidence: "high",
        criterion_0_answer: "yes",
        criterion_1_answer: "yes",
        evidence_note: "Both statements are visibly true."
      }),
      assignmentId: "assignment-1",
      criterionIds: ["hero-cta-no-overlap", "footer-visible"],
      providerId: "real-provider",
      providerTaskId: "hit-1",
      taskTemplate: buildStructuredTaskTemplate(binaryEnvelope),
      workerId: "worker-1"
    });

    expect(payload).toMatchObject({
      defect_category: "binary_screenshot_check",
      overall_verdict: "pass",
      provider_response_id: "assignment-1",
      provider_task_id: "hit-1",
      reviewer_pseudonymous_id: "worker-1",
      severity: "S4"
    });
    expect(payload.criterion_results).toHaveLength(2);
  });

  it("keeps the legacy field mapping for free-text templates", () => {
    const payload = normalizeAssignment({
      answerXml: answerXml({
        criterion_0_confidence: "high",
        criterion_0_status: "pass",
        defect_category: "none",
        evidence_note: "Looks correct.",
        overall_verdict: "pass",
        severity: "S4"
      }),
      assignmentId: "assignment-2",
      criterionIds: ["check-1"],
      providerId: "real-provider",
      providerTaskId: "hit-2",
      taskTemplate: "Review the embedded screenshot.",
      workerId: "worker-2"
    });

    expect(payload).toMatchObject({
      defect_category: "none",
      overall_verdict: "pass",
      severity: "S4"
    });
  });
});
