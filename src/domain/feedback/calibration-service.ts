import type { FinalVerdictState } from "./models.js";

export type CalibrationOutcome =
  | "agreement"
  | "false_positive"
  | "false_negative"
  | "divergent_retry";

export function classifyCalibrationOutcome(input: {
  selfVerdict: FinalVerdictState;
  finalVerdict: FinalVerdictState;
}): CalibrationOutcome {
  if (input.selfVerdict === input.finalVerdict) {
    return "agreement";
  }

  if (input.selfVerdict === "pass" && input.finalVerdict === "fail") {
    return "false_negative";
  }

  if (input.selfVerdict === "fail" && input.finalVerdict === "pass") {
    return "false_positive";
  }

  return "divergent_retry";
}
