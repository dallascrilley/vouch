import type { ConsensusService } from "../consensus/consensus-service.js";
import type { AdjudicationService } from "../adjudication/adjudication-service.js";
import type { HumanResponse } from "./models.js";
import type { HumanReviewTaskRepository } from "../../adapters/storage/repositories.js";

export class ProviderWorkflowService {
  constructor(
    private readonly consensusService: ConsensusService,
    private readonly adjudicationService: AdjudicationService,
    private readonly reviewTaskRepository: HumanReviewTaskRepository
  ) {}

  async maybeAutoAdvanceAfterIngest(input: {
    deduplicated: boolean;
    response: HumanResponse | null;
    reviewTaskId: string;
  }): Promise<{ advanced: boolean }> {
    if (input.deduplicated || !input.response) {
      return { advanced: false };
    }

    const reviewTask = await this.reviewTaskRepository.findById(input.reviewTaskId);
    if (!reviewTask?.providerAdapter) {
      return { advanced: false };
    }

    const jobId = reviewTask.jobId;

    if (input.response.overallVerdict !== "pass") {
      return { advanced: false };
    }

    if (!input.response.criterionResults.every((criterion) => criterion.status === "pass")) {
      return { advanced: false };
    }

    const consensusId = `consensus_${crypto.randomUUID()}`;
    await this.consensusService.record({
      adjudicationTrigger: undefined,
      artifactSufficiency: "sufficient",
      consensusId,
      createdAt: new Date(),
      criterionProbabilities: {},
      disagreementLevel: "low",
      jobId,
      quorumState: "met",
      recommendedOutcome: "pass",
      reviewTaskId: input.reviewTaskId,
      severitySummary: input.response.severity === "S4" ? "none" : input.response.severity,
      validResponseCount: 1
    });

    const adjudicationId = `adjudication_${crypto.randomUUID()}`;
    await this.adjudicationService.record({
      adjudicationId,
      assignedPool: reviewTask.reviewerPool,
      createdAt: new Date(),
      decidedAt: new Date(),
      decision: "pass",
      decisionNotes: "Auto-advanced after provider pass callback",
      jobId,
      normalizedEvidenceRefs: input.response.annotationRefs,
      triggerReason: "provider_response_auto_advance"
    });

    return { advanced: true };
  }
}
