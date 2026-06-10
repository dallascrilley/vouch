import type { FeedbackService } from "../feedback/feedback-service.js";
import type { VerdictService } from "../feedback/verdict-service.js";
import type { JobService } from "../jobs/job-service.js";
import { resolveBudgetPolicy } from "../jobs/budget-policy.js";
import type { LedgerService } from "../ledger/ledger-service.js";
import type { HumanReviewTaskService } from "./human-review-task-service.js";
import type { HumanResponse, HumanReviewTask } from "./models.js";
import type {
  HumanResponseRepository,
  HumanReviewTaskRepository
} from "../../adapters/storage/repositories.js";
import type { TransactionManager } from "../../adapters/storage/transaction-manager.js";

export const PAIRWISE_TASK_TEMPLATE = "pairwise-tie-break";

const SEVERE_SEVERITIES: ReadonlySet<HumanResponse["severity"]> = new Set(["S0", "S1"]);

type UnanimousVerdict = "pass" | "fail";

// Fail auto-advance demands high confidence on every criterion; a pass is the
// provider's affirmative claim while a fail terminates the job against the
// agent, so the bar is deliberately higher.
function classifyUnanimousVerdict(response: HumanResponse): UnanimousVerdict | null {
  if (
    response.overallVerdict === "pass" &&
    response.criterionResults.every((criterion) => criterion.status === "pass")
  ) {
    return "pass";
  }

  if (
    response.overallVerdict === "fail" &&
    response.criterionResults.length > 0 &&
    response.criterionResults.every(
      (criterion) => criterion.status === "fail" && criterion.confidence === "high"
    )
  ) {
    return "fail";
  }

  return null;
}

export class ProviderWorkflowService {
  constructor(
    private readonly jobService: JobService,
    private readonly ledgerService: LedgerService,
    private readonly verdictService: VerdictService,
    private readonly feedbackService: FeedbackService,
    private readonly reviewTaskRepository: HumanReviewTaskRepository,
    private readonly transactionManager: TransactionManager,
    private readonly responseRepository: HumanResponseRepository,
    private readonly reviewTaskService: HumanReviewTaskService
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

    const response = input.response;

    const unanimousVerdict = classifyUnanimousVerdict(response);
    if (!unanimousVerdict) {
      return { advanced: false };
    }

    // Unanimity must hold across every response on the task, not just the
    // triggering one — a pass arriving after a disagreeing sibling is a split
    // signal, not an auto-advance. A single response IS unanimous by design:
    // provider-managed tasks may run with maxAssignments=1 and there is no
    // synthetic quorum to wait for.
    const siblingResponses = await this.responseRepository.findByReviewTaskId(input.reviewTaskId);
    if (!siblingResponses.every((sibling) => classifyUnanimousVerdict(sibling) === unanimousVerdict)) {
      return { advanced: false };
    }

    const job = await this.jobService.get(reviewTask.jobId);
    if (!job) {
      return { advanced: false };
    }

    const providerId = response.providerId;
    const providerResponseId = response.providerResponseId;
    if (!providerId || !providerResponseId) {
      return { advanced: false };
    }

    const resolvedBudgetPolicy = resolveBudgetPolicy(job.budgetPolicy, job.riskTier);
    const retryAllowed = unanimousVerdict === "fail" && resolvedBudgetPolicy.maxRetries > 0;

    await this.transactionManager.inTransaction(async () => {
      await this.ledgerService.recordProviderAutoResolved({
        correlationId: response.responseId,
        jobId: job.jobId,
        overallVerdict: response.overallVerdict,
        payloadHash: response.responseId,
        policyVersion: "v1",
        providerId,
        providerResponseId,
        reviewTaskId: input.reviewTaskId,
        validResponseCount: 1
      });

      const currentJob = await this.jobService.get(job.jobId);
      if (!currentJob) {
        throw new Error(`Verification job not found: ${job.jobId}`);
      }

      const verdict = await this.verdictService.finalize(currentJob, unanimousVerdict, {
        adjudicationSummary: `Auto-advanced after unanimous provider ${unanimousVerdict} callback`,
        criterionOutcomes: unanimousVerdict === "fail" ? response.criterionResults : [],
        humanConsensusSummary: `Single provider response (${providerResponseId}); no human quorum`,
        maxSeverity: unanimousVerdict === "fail" ? response.severity : "none"
      });

      await this.feedbackService.emit(currentJob, verdict, {
        defectCategory: unanimousVerdict === "fail" ? response.defectCategory : undefined,
        humanAnnotations: response.annotationRefs,
        policyConstraints: ["provider_auto_resolved"],
        providerIds: [providerId],
        providerResponseIds: [providerResponseId],
        retryAllowed,
        retryReason: retryAllowed ? "provider_unanimous_fail" : undefined
      });
    });

    return { advanced: true };
  }

  async maybeQueuePairwiseTieBreak(input: {
    deduplicated: boolean;
    response: HumanResponse | null;
    reviewTaskId: string;
  }): Promise<{ queued: boolean; reviewTask: HumanReviewTask | null }> {
    const notQueued = { queued: false, reviewTask: null };

    if (input.deduplicated || !input.response) {
      return notQueued;
    }

    const reviewTask = await this.reviewTaskRepository.findById(input.reviewTaskId);
    if (!reviewTask?.providerAdapter) {
      return notQueued;
    }

    // A tie-break task never spawns another tie-break; its split resolves
    // through the manual consensus/adjudication path.
    if (reviewTask.taskTemplate === PAIRWISE_TASK_TEMPLATE) {
      return notQueued;
    }

    const responses = await this.responseRepository.findByReviewTaskId(input.reviewTaskId);
    const distinctVerdicts = [...new Set(responses.map((response) => response.overallVerdict))];
    if (responses.length < 2 || distinctVerdicts.length < 2) {
      return notQueued;
    }

    // A severe minority is an adjudication trigger, not a tie to break cheaply.
    if (responses.some((response) => SEVERE_SEVERITIES.has(response.severity))) {
      return notQueued;
    }

    const job = await this.jobService.get(reviewTask.jobId);
    if (!job || job.state !== "human_responses_received") {
      return notQueued;
    }

    const triggeringResponse = input.response;

    // The one-per-job guard and the create must commit atomically so two
    // concurrent disagreeing callbacks cannot both queue a tie-break.
    return this.transactionManager.inTransaction(async () => {
      const existingTasks = await this.reviewTaskRepository.findByJobId(job.jobId);
      if (existingTasks.some((task) => task.taskTemplate === PAIRWISE_TASK_TEMPLATE)) {
        return notQueued;
      }

      const pairwiseTask = await this.reviewTaskService.create({
        criterionIds: reviewTask.criterionIds,
        deadlineAt: reviewTask.deadlineAt,
        jobId: job.jobId,
        providerAdapter: reviewTask.providerAdapter,
        qualityPolicy: reviewTask.qualityPolicy,
        reviewerPool: reviewTask.reviewerPool,
        sanitizedPackageId: reviewTask.sanitizedPackageId,
        taskTemplate: PAIRWISE_TASK_TEMPLATE
      });

      await this.ledgerService.recordProviderPairwiseQueued({
        correlationId: triggeringResponse.responseId,
        disagreementVerdicts: distinctVerdicts,
        jobId: job.jobId,
        pairwiseReviewTaskId: pairwiseTask.reviewTaskId,
        payloadHash: triggeringResponse.responseId,
        policyVersion: "v1",
        sourceReviewTaskId: input.reviewTaskId
      });

      return { queued: true, reviewTask: pairwiseTask };
    });
  }
}
