import { evaluateExternalizationPolicy } from "./externalization-policy.js";
import type { PrivacyClassification } from "./models.js";
import type { ReviewerPoolType } from "../shared/types.js";
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

  async record(input: PrivacyClassification): Promise<void> {
    const job = await this.jobService.get(input.jobId);
    if (!job) {
      throw new Error(`Verification job not found: ${input.jobId}`);
    }

    // The externalization decision is authoritative on the server, never the
    // client. Redaction that did not complete cleanly always fails closed
    // regardless of what the caller asserts (defence-in-depth; the per-pool
    // policy is re-checked at dispatch time in assertProviderDispatchAllowed).
    const classification = this.enforceServerSideDecision(input);

    await this.transactionManager.inTransaction(async () => {
      await this.ledgerService.recordStateTransition(
        job.state,
        "privacy_classified",
        {
          correlationId: classification.classificationId,
          jobId: job.jobId,
          payloadHash: classification.classificationId,
          policyVersion: classification.policyVersion
        }
      );

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

  async assertProviderDispatchAllowed(
    jobId: string,
    providerRoute: ReviewerPoolType
  ) {
    const classification =
      this.classifications.get(jobId) ??
      (await this.privacyRepository.findByJobId(jobId));
    if (!classification) {
      throw new Error(
        `Privacy classification not found for verification job: ${jobId}`
      );
    }

    // Authoritative gate: recompute the policy for the concrete reviewer pool
    // the caller is trying to dispatch to, rather than trusting the stored
    // (originally client-supplied) decision.
    const policy = evaluateExternalizationPolicy({
      dataClass: classification.dataClass,
      redactionStatus: classification.redactionStatus,
      reviewerPool: providerRoute,
      route: ""
    });
    if (!policy.allowed) {
      throw new Error(
        `Provider dispatch is blocked by privacy policy: ${policy.blockedReasons.join("; ")}`
      );
    }

    if (
      classification.allowedReviewerRoutes.length > 0 &&
      !classification.allowedReviewerRoutes.includes(providerRoute)
    ) {
      throw new Error(
        `Provider dispatch is not allowed for route: ${providerRoute}`
      );
    }

    return classification;
  }

  private enforceServerSideDecision(
    input: PrivacyClassification
  ): PrivacyClassification {
    if (
      input.redactionStatus === "failed" ||
      input.redactionStatus === "insufficient_confidence"
    ) {
      // Force fail-closed regardless of the client-asserted decision. Preserve
      // any caller-supplied reasons; only supply a default when none are given.
      return {
        ...input,
        externalizationDecision: "blocked_fail_closed",
        blockedReasons:
          input.blockedReasons.length > 0
            ? input.blockedReasons
            : ["redaction did not complete successfully"]
      };
    }
    return input;
  }
}
