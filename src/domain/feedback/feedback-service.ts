import type { AgentFeedbackSignal, FinalVerdict } from "./models.js";
import type { AgentFeedbackRepository } from "../../adapters/storage/repositories.js";
import type { VerificationJob } from "../jobs/models.js";

type FeedbackOptions = {
  budgetState?: string;
  defectCategory?: string;
  humanAnnotations?: string[];
  machineCheckFailures?: string[];
  policyConstraints?: string[];
  retryAllowed: boolean;
  retryReason?: string;
};

export class FeedbackService {
  constructor(private readonly feedbackRepository: AgentFeedbackRepository) {}

  async emit(
    job: VerificationJob,
    verdict: FinalVerdict,
    options: FeedbackOptions
  ): Promise<AgentFeedbackSignal> {
    const signal: AgentFeedbackSignal = {
      feedbackId: `feedback_${job.jobId}`,
      jobId: job.jobId,
      finalVerdict: verdict.finalVerdict,
      failedCriteria: verdict.criterionOutcomes
        .filter((criterion) => criterion.status === "fail" || criterion.status === "unclear")
        .map((criterion) => criterion.criterionId),
      severity: verdict.maxSeverity === "none" ? undefined : verdict.maxSeverity,
      defectCategory: options.defectCategory,
      evidencePointers: verdict.evidenceRefs,
      humanAnnotations: options.humanAnnotations ?? [],
      machineCheckFailures: options.machineCheckFailures ?? [],
      retryAllowed: options.retryAllowed,
      retryReason: options.retryReason,
      repairHint: verdict.retryRecommendation,
      budgetState: options.budgetState,
      policyConstraints: options.policyConstraints ?? []
    };

    await this.feedbackRepository.save(signal);
    return signal;
  }
}
