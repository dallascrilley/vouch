import { describe, expect, it } from "vitest";

import { deriveAgentNextActionFromVerdict } from "../../src/domain/feedback/agent-action.js";

describe("agent feedback next action", () => {
  it.each([
    ["pass", false, "pass"],
    ["fail", false, "fail"],
    ["fail_closed", false, "fail"],
    ["retry", true, "retry"],
    ["retry", false, "escalate"],
    ["recapture", true, "recapture"],
    ["recapture", false, "escalate"],
    ["unclear", false, "escalate"]
  ] as const)("maps %s with retryAllowed=%s to %s", (finalVerdict, retryAllowed, nextAction) => {
    expect(deriveAgentNextActionFromVerdict(finalVerdict, retryAllowed)).toBe(nextAction);
  });
});
