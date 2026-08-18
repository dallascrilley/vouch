import { describe, expect, it } from "vitest";

import {
  PAIRWISE_TASK_TEMPLATE,
  buildPairwiseTieBreakTemplate,
  isPairwiseTieBreakTemplate
} from "../../src/domain/human-review/provider-workflow-service.js";
import { parseDispatchPricing } from "../../src/api/spend-ceiling.js";

describe("pairwise tie-break templates", () => {
  it("recognizes the legacy opaque marker and priced envelopes", () => {
    expect(isPairwiseTieBreakTemplate(PAIRWISE_TASK_TEMPLATE)).toBe(true);
    expect(
      isPairwiseTieBreakTemplate(buildPairwiseTieBreakTemplate("opaque"))
    ).toBe(true);
    expect(isPairwiseTieBreakTemplate("provider-template")).toBe(false);
  });

  it("carries structured pricing so a spend ceiling can reserve", () => {
    const template = buildPairwiseTieBreakTemplate(
      JSON.stringify({
        v: 1,
        pricing: { max_assignments: 3, reward: "0.10" }
      })
    );
    expect(parseDispatchPricing(template)).toEqual({
      max_assignments: 1,
      reward: "0.10"
    });
  });
});
