import type {
  AgentFeedbackSignal,
  AgentNextAction,
  FinalVerdictState
} from "./models.js";

type AgentActionInput = Pick<
  AgentFeedbackSignal,
  "finalVerdict" | "retryAllowed"
>;

export function deriveAgentNextAction(
  input: AgentActionInput
): AgentNextAction {
  switch (input.finalVerdict) {
    case "pass":
      return "pass";
    case "fail":
    case "fail_closed":
      return "fail";
    case "retry":
      return input.retryAllowed ? "retry" : "escalate";
    case "recapture":
      return input.retryAllowed ? "recapture" : "escalate";
    case "unclear":
      return "escalate";
  }
}

export function deriveAgentNextActionFromVerdict(
  finalVerdict: FinalVerdictState,
  retryAllowed: boolean
): AgentNextAction {
  return deriveAgentNextAction({ finalVerdict, retryAllowed });
}
