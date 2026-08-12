import type { AdjudicationCase } from "../consensus/models.js";
import type {
  AdjudicationCaseRepository,
  ConsensusResultRepository,
  HumanResponseRepository,
  HumanReviewTaskRepository
} from "../../adapters/storage/repositories.js";
import type { TransactionManager } from "../../adapters/storage/transaction-manager.js";
import type { JobService } from "../jobs/job-service.js";
import type { LedgerService } from "../ledger/ledger-service.js";
import type { FeedbackService } from "../feedback/feedback-service.js";
import type { VerdictService } from "../feedback/verdict-service.js";
import type { HumanResponse, Severity } from "../human-review/models.js";

const severityRank: Record<Severity, number> = {
  S0: 4,
  S1: 3,
  S2: 2,
  S3: 1,
  S4: 0
};

export class AdjudicationService {
  constructor(
    private readonly adjudicationRepository: AdjudicationCaseRepository,
    private readonly consensusRepository: ConsensusResultRepository,
    private readonly responseRepository: HumanResponseRepository,
    private readonly reviewTaskRepository: HumanReviewTaskRepository,
    private readonly jobService: JobService,
    private readonly ledgerService: LedgerService,
    private readonly verdictService: VerdictService,
    private readonly feedbackService: FeedbackService,
    private readonly transactionManager: TransactionManager
  ) {}

  async record(caseFile: AdjudicationCase): Promise<void> {
    const job = await this.jobService.get(caseFile.jobId);
    if (!job) {
      throw new Error(`Verification job not found: ${caseFile.jobId}`);
    }

    if (!caseFile.decision) {
      throw new Error("Adjudication decision is required");
    }
    const decision = caseFile.decision;

    const reviewTasks = await this.reviewTaskRepository.findByJobId(job.jobId);
    const reviewTask = reviewTasks.at(0);
    const responses = reviewTask
      ? await this.responseRepository.findByReviewTaskId(
          reviewTask.reviewTaskId
        )
      : [];
    const providerIds = [
      ...new Set(
        responses
          .map((response) => response.providerId)
          .filter((value): value is string => Boolean(value))
      )
    ];
    const providerResponseIds = responses
      .map((response) => response.providerResponseId)
      .filter((value): value is string => Boolean(value));
    const criterionOutcomes = responses.flatMap(
      (response) => response.criterionResults
    );
    const maxSeverity = this.maxSeverity(responses);
    const defectCategory = responses.find(
      (response) => response.defectCategory !== "none"
    )?.defectCategory;
    const providerSummary =
      providerIds.length > 0
        ? `Adjudication considered provider receipts from ${providerIds.join(", ")}`
        : undefined;

    await this.transactionManager.inTransaction(async () => {
      await this.ledgerService.recordStateTransition(
        job.state,
        "adjudication_required",
        {
          correlationId: caseFile.adjudicationId,
          jobId: job.jobId,
          payloadHash: caseFile.adjudicationId,
          policyVersion: "v1"
        }
      );

      job.state = "adjudication_required";
      await this.jobService.save(job);
      await this.adjudicationRepository.save({
        ...caseFile,
        providerIds,
        providerResponseIds,
        providerSummary
      });
      await this.consensusRepository.markAdjudicated(job.jobId);

      const verdict = await this.verdictService.finalize(
        job,
        this.toFinalVerdict(decision),
        {
          adjudicationSummary: providerSummary ?? caseFile.decisionNotes,
          criterionOutcomes,
          humanConsensusSummary: providerSummary,
          maxSeverity,
          retryRecommendation: decision === "retry" ? "retry" : undefined
        }
      );
      await this.feedbackService.emit(job, verdict, {
        defectCategory,
        humanAnnotations: providerResponseIds,
        policyConstraints: [caseFile.triggerReason],
        providerIds,
        providerResponseIds,
        retryAllowed: decision === "retry" || decision === "recapture",
        retryReason: caseFile.triggerReason
      });
    });
  }

  private toFinalVerdict(decision: NonNullable<AdjudicationCase["decision"]>) {
    switch (decision) {
      case "pass":
        return "pass" as const;
      case "fail":
        return "fail" as const;
      case "retry":
        return "retry" as const;
      case "recapture":
        return "recapture" as const;
      case "fail_closed":
        return "fail_closed" as const;
    }
  }

  private maxSeverity(responses: HumanResponse[]) {
    const failingSeverities = responses
      .filter((response) => response.overallVerdict !== "pass")
      .map((response) => response.severity)
      .sort((left, right) => severityRank[right] - severityRank[left]);

    return failingSeverities.at(0) ?? "none";
  }
}
