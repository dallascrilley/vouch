import { evaluateExternalizationPolicy } from "./externalization-policy.js";
import type { PrivacyClassification } from "./models.js";
import type { ReviewerPoolType } from "../shared/types.js";
import type { PrivacyClassificationRepository } from "../../adapters/storage/repositories.js";
import type { TransactionManager } from "../../adapters/storage/transaction-manager.js";
import type { LedgerService } from "../ledger/ledger-service.js";
import type { JobService } from "../jobs/job-service.js";
import type { FeedbackService } from "../feedback/feedback-service.js";
import type { VerdictService } from "../feedback/verdict-service.js";

export class PrivacyPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrivacyPolicyError";
  }
}

export class PrivacyGate {
  private readonly classifications = new Map<string, PrivacyClassification>();

  constructor(
    private readonly privacyRepository: PrivacyClassificationRepository,
    private readonly jobService: JobService,
    private readonly ledgerService: LedgerService,
    private readonly verdictService: VerdictService,
    private readonly feedbackService: FeedbackService,
    private readonly transactionManager: TransactionManager,
    private readonly agentExternalizationEnabled = false
  ) {}

  async record(input: PrivacyClassification): Promise<void> {
    const job = await this.jobService.get(input.jobId);
    if (!job) {
      throw new Error(`Verification job not found: ${input.jobId}`);
    }
    if (!job.artifactManifestId) {
      throw new PrivacyPolicyError(
        "Privacy classification requires a persisted artifact manifest"
      );
    }
    if (job.artifactManifestId !== input.artifactManifestId) {
      throw new PrivacyPolicyError(
        "Privacy classification does not match the job artifact manifest"
      );
    }

    // The externalization decision is authoritative on the server, never the
    // client. Redaction that did not complete cleanly always fails closed
    // regardless of what the caller asserts (defence-in-depth; the per-pool
    // policy is re-checked at dispatch time in assertProviderDispatchAllowed).
    const classification = this.enforceServerSideDecision(input, job);

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
    const job = await this.jobService.get(jobId);
    if (!job) {
      throw new Error(`Verification job not found: ${jobId}`);
    }

    const classification =
      this.classifications.get(jobId) ??
      (await this.privacyRepository.findByJobId(jobId));
    if (!classification) {
      throw new Error(
        `Privacy classification not found for verification job: ${jobId}`
      );
    }

    // Authoritative gate: recompute the policy for the concrete reviewer pool
    // and the job's recorded route, rather than trusting the stored
    // (originally client-supplied) decision. An empty route would skip the
    // /billing internal-only rule.
    const policy = evaluateExternalizationPolicy({
      dataClass: classification.dataClass,
      redactionStatus: classification.redactionStatus,
      reviewerPool: providerRoute,
      route: job.source.route
    });
    if (!policy.allowed) {
      throw new PrivacyPolicyError(
        `Provider dispatch is blocked by privacy policy: ${policy.blockedReasons.join("; ")}`
      );
    }

    if (
      classification.allowedReviewerRoutes.length === 0 ||
      !classification.allowedReviewerRoutes.includes(providerRoute)
    ) {
      throw new PrivacyPolicyError(
        `Provider dispatch is not allowed for route: ${providerRoute}`
      );
    }

    return classification;
  }

  private enforceServerSideDecision(
    input: PrivacyClassification,
    job: { agentRunId?: string; jobId: string; source?: { repository: string } }
  ): PrivacyClassification {
    // Agent authority is derived from a server-held go-live grant, not from
    // editable source metadata or an approval value supplied by the agent.
    // Simulated reviews do not cross the externalization boundary; real agent
    // reviews require the operator-enabled runtime configuration.
    const requestsExternalReview =
      input.allowedReviewerRoutes.length === 0 ||
      input.allowedReviewerRoutes.some((route) => route !== "internal");
    const isServerRecordedAgentWorkflow =
      job.source?.repository === "pi-extension";
    if (
      isServerRecordedAgentWorkflow &&
      requestsExternalReview &&
      !job.agentRunId
    ) {
      input = {
        ...input,
        dataClass: "regulated_or_secret",
        externalizationDecision: "blocked_fail_closed",
        blockedReasons: [
          ...input.blockedReasons,
          "external review requires a server-recorded agent run"
        ]
      };
    } else if (
      job.agentRunId &&
      requestsExternalReview &&
      !this.agentExternalizationEnabled
    ) {
      input = {
        ...input,
        dataClass: "regulated_or_secret",
        externalizationDecision: "blocked_fail_closed",
        blockedReasons: [
          ...input.blockedReasons,
          "agent externalization requires the server-held go-live grant"
        ]
      };
    }
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
