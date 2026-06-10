import type { HumanResponse, HumanReviewTask } from "../../domain/human-review/models.js";

type SimulatedResponseInput = {
  confidence?: HumanResponse["confidence"];
  reviewTask: HumanReviewTask;
};

export function simulateProviderResponse(input: SimulatedResponseInput): HumanResponse {
  const now = new Date();

  return {
    annotationRefs: [],
    artifactIssueFlags: [],
    confidence: input.confidence ?? "high",
    criterionResults: input.reviewTask.criterionIds.map((criterionId) => ({
      confidence: input.confidence ?? "high",
      criterionId,
      status: "pass"
    })),
    defectCategory: "none",
    evidenceNote: "Local provider simulation generated a deterministic pass response.",
    overallVerdict: "pass",
    providerId: "local-provider-simulator",
    providerResponseId: `simulated_${input.reviewTask.reviewTaskId}`,
    qualityFlags: [],
    responseId: `simulated_${input.reviewTask.reviewTaskId}`,
    reviewTaskId: input.reviewTask.reviewTaskId,
    reviewerPseudonymousId: "local-provider-simulator",
    severity: "S4",
    submittedAt: now
  };
}
