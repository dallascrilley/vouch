import type { PrivacyClassification } from "./models.js";
import type { PrivacyClassificationRepository } from "../../adapters/storage/repositories.js";
import type { TransactionManager } from "../../adapters/storage/transaction-manager.js";
import type { LedgerService } from "../ledger/ledger-service.js";
import type { JobService } from "../jobs/job-service.js";
import type { FeedbackService } from "../feedback/feedback-service.js";
import type { VerdictService } from "../feedback/verdict-service.js";

export class PrivacyGate {
  private readonly classifications = new Map<string, PrivacyClassification>();

  constructor(
    private readonly privacyRepository: PrivacyClassificationRepository,
    private readonly jobService: JobService,
    private readonly ledgerService: LedgerService,
    private readonly verdictService: VerdictService,
    private readonly feedbackService: FeedbackService,
    private readonly transactionManager: TransactionManager
  ) {}

  async record(classification: PrivacyClassification): Promise<void> {
    const job = await this.jobService.get(classification.jobId);
    if (!job) {
      throw new Error(`Verification job not found: ${classification.jobId}`);
    }

    await this.transactionManager.inTransaction(async () => {
      await this.ledgerService.recordStateTransition(job.state, "privacy_classified", {
        correlationId: classification.classificationId,
        jobId: job.jobId,
        payloadHash: classification.classificationId,
        policyVersion: classification.policyVersion
      });

      job.state = "privacy_classified";
      await this.jobService.save(job);
      await this.privacyRepository.save(classification);
      this.classifications.set(classification.jobId, classification);
      await this.ledgerService.recordExternalizationDecision({
        correlationId: classification.classificationId,
        decision: classification.externalizationDecision,
        jobId: job.jobId,
        payloadHash: classification.classificationId,
        policyVersion: classification.policyVersion
      });

      if (classification.externalizationDecision === "blocked_fail_closed") {
        const verdict = await this.verdictService.finalize(job, "fail_closed", {
          policyConstraints: classification.blockedReasons
        });
        await this.feedbackService.emit(job, verdict, {
          policyConstraints: classification.blockedReasons,
          retryAllowed: false
        });
      }
    });
  }

  async assertProviderDispatchAllowed(jobId: string, providerRoute: string) {
    const classification =
      this.classifications.get(jobId) ?? (await this.privacyRepository.findByJobId(jobId));
    if (!classification) {
      throw new Error(`Privacy classification not found for verification job: ${jobId}`);
    }

    if (classification.externalizationDecision !== "allowed") {
      throw new Error("Provider dispatch is blocked by privacy policy");
    }

    if (
      classification.allowedReviewerRoutes.length > 0 &&
      !classification.allowedReviewerRoutes.includes(providerRoute as never)
    ) {
      throw new Error(`Provider dispatch is not allowed for route: ${providerRoute}`);
    }

    return classification;
  }
}
