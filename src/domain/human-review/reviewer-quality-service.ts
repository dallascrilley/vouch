import type { DataClass } from "../privacy/models.js";
import type { HumanResponse, ReviewerPool } from "./models.js";

export function assessReviewerEligibility(input: {
  dataClass: DataClass;
  reviewerPool: ReviewerPool;
  response?: HumanResponse;
}) {
  const allowed = input.reviewerPool.privacyAllowedClasses.includes(input.dataClass);
  const qualityFlags = input.response?.qualityFlags ?? [];

  return {
    allowed: allowed && !qualityFlags.includes("blocked"),
    blockedReasons: allowed ? qualityFlags.filter((flag) => flag === "blocked") : ["privacy class not allowed"],
    requiresFollowUp: qualityFlags.includes("attention-check-failed")
  };
}
