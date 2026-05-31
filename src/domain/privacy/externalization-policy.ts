import type { DataClass, ExternalizationDecision, RedactionStatus } from "./models.js";
import type { ReviewerPoolType } from "../shared/types.js";

export type ExternalizationPolicyDecision = {
  allowed: boolean;
  blockedReasons: string[];
  decision: ExternalizationDecision;
};

export function evaluateExternalizationPolicy(input: {
  dataClass: DataClass;
  redactionStatus: RedactionStatus;
  reviewerPool: ReviewerPoolType;
  route: string;
}) : ExternalizationPolicyDecision {
  if (input.redactionStatus === "failed" || input.redactionStatus === "insufficient_confidence") {
    return {
      allowed: false,
      blockedReasons: ["redaction did not complete successfully"],
      decision: "blocked_fail_closed"
    };
  }

  if (input.dataClass === "regulated_or_secret" && input.reviewerPool !== "internal") {
    return {
      allowed: false,
      blockedReasons: ["regulated or secret data requires internal review"],
      decision: "blocked_fail_closed"
    };
  }

  if (input.dataClass === "sensitive_internal" && input.reviewerPool === "public_crowd") {
    return {
      allowed: false,
      blockedReasons: ["public crowd review is blocked for sensitive internal data"],
      decision: "managed_only"
    };
  }

  if (input.route.startsWith("/billing") && input.reviewerPool !== "internal") {
    return {
      allowed: false,
      blockedReasons: ["billing routes require internal review"],
      decision: "internal_only"
    };
  }

  return {
    allowed: true,
    blockedReasons: [],
    decision: "allowed"
  };
}
