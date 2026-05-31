import { describe, expect, it } from "vitest";

import { classifyCalibrationOutcome } from "../../src/domain/feedback/calibration-service.js";

describe("US3 calibration loop", () => {
  it("classifies false negatives when self-verification passes but final verdict fails", () => {
    expect(
      classifyCalibrationOutcome({
        finalVerdict: "fail",
        selfVerdict: "pass"
      })
    ).toBe("false_negative");
  });

  it("classifies divergent retry outcomes separately", () => {
    expect(
      classifyCalibrationOutcome({
        finalVerdict: "retry",
        selfVerdict: "recapture"
      })
    ).toBe("divergent_retry");
  });
});
