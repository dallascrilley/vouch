import type { FastifyInstance } from "fastify";

import { localQueueJobNames } from "../../adapters/queue/local-queue.js";
import type {
  AdjudicationDecision,
  ConsensusOutcome,
  DisagreementLevel,
  QuorumState
} from "../../domain/consensus/models.js";
import type {
  HumanReviewVerdict,
  Severity
} from "../../domain/human-review/models.js";
import { ProviderDispatchError } from "../../adapters/providers/real-provider-adapter.js";
import { shouldFallbackProvider } from "../../domain/human-review/provider-routing-policy.js";
import { PrivacyPolicyError } from "../../domain/privacy/privacy-gate.js";
import type { ReviewerPoolType } from "../../domain/shared/types.js";
import { reserveRealProviderDispatch } from "../spend-ceiling.js";

type HumanReviewTaskBody = {
  criterion_ids: string[];
  deadline_at: string;
  idempotency_key?: string;
  provider_adapter?: string;
  quality_policy: string;
  reviewer_pool: ReviewerPoolType;
  sanitized_package_id: string;
  task_template: string;
  visual_evidence?: {
    artifact_id: string;
    caption: string;
    content_hash: string;
    data_url: string;
    viewport: string;
  };
};

type HumanResponseBody = {
  confidence: "low" | "medium" | "high";
  criterion_results: Array<{
    criterion_id: string;
    status: "pass" | "fail" | "unclear" | "not_visible";
    confidence: "low" | "medium" | "high";
  }>;
  defect_category: string;
  evidence_note: string;
  overall_verdict: HumanReviewVerdict;
  quality_flags?: string[];
  reviewer_pseudonymous_id: string;
  severity: Severity;
};

type ConsensusBody = {
  adjudication_trigger?: string;
  artifact_sufficiency: "sufficient" | "insufficient";
  disagreement_level: DisagreementLevel;
  quorum_state: QuorumState;
  recommended_outcome: ConsensusOutcome;
  review_task_id: string;
  severity_summary: Severity | "none";
  valid_response_count: number;
};

type AdjudicationBody = {
  assigned_pool?: ReviewerPoolType;
  decision: AdjudicationDecision;
  decision_notes?: string;
  normalized_evidence_refs?: string[];
  trigger_reason: string;
};

export function registerHumanReviewRoutes(app: FastifyInstance) {
  app.post<{ Params: { jobId: string }; Body: HumanReviewTaskBody }>(
    "/verification-jobs/:jobId/human-review-tasks",
    async (request, reply) => {
      let providerTaskId: string | undefined;
      let reservationKey: string | undefined;
      let reservationCreated = false;
      let dispatchedReviewTask:
        | Awaited<
            ReturnType<typeof app.services.humanReviewTaskService.createOrGet>
          >["task"]
        | undefined;
      try {
        const result = await app.services.humanReviewTaskService.createOrGet({
          criterionIds: request.body.criterion_ids,
          deadlineAt: new Date(request.body.deadline_at),
          jobId: request.params.jobId,
          idempotencyKey: request.body.idempotency_key,
          providerAdapter: request.body.provider_adapter,
          qualityPolicy: request.body.quality_policy,
          reviewerPool: request.body.reviewer_pool,
          sanitizedPackageId: request.body.sanitized_package_id,
          taskTemplate: request.body.task_template,
          visualEvidence: request.body.visual_evidence
            ? {
                artifactId: request.body.visual_evidence.artifact_id,
                caption: request.body.visual_evidence.caption,
                contentHash: request.body.visual_evidence.content_hash,
                dataUrl: request.body.visual_evidence.data_url,
                viewport: request.body.visual_evidence.viewport
              }
            : undefined
        });

        const reviewTask = result.task;
        dispatchedReviewTask = reviewTask;
        const canRetryRealDispatch =
          !result.created &&
          reviewTask.state === "queued" &&
          app.services.providerConfig?.enabled === true &&
          reviewTask.providerAdapter === app.services.providerConfig.providerId;
        if (!result.created && !canRetryRealDispatch) {
          return reply.code(202).send({
            dispatch_status: reviewTask.state,
            job_id: reviewTask.jobId,
            provider_adapter: reviewTask.providerAdapter,
            provider_task_id: reviewTask.providerTaskRef,
            review_task_id: reviewTask.reviewTaskId,
            reviewer_pool: reviewTask.reviewerPool
          });
        }

        let dispatchStatus = reviewTask.state;

        if (
          app.services.providerConfig?.enabled &&
          reviewTask.providerAdapter === app.services.providerConfig.providerId
        ) {
          await app.services.privacyGate.assertProviderDispatchAllowed(
            request.params.jobId,
            request.body.reviewer_pool
          );

          const fallbackDecision = shouldFallbackProvider({
            health: app.services.providerOperationsService.getHealthSnapshot(),
            preferredProviderId: app.services.providerConfig.providerId
          });

          if (
            !fallbackDecision.fallback &&
            app.services.providerDispatchWorker
          ) {
            if (
              app.services.runtimeConfig.realSpendCeilingUsd !== undefined &&
              !request.body.idempotency_key
            ) {
              throw new Error("Real dispatch idempotency key is required");
            }
            reservationKey =
              request.body.idempotency_key ??
              `review-task:${reviewTask.reviewTaskId}`;
            reserveRealProviderDispatch({
              ceilingUsd: app.services.runtimeConfig.realSpendCeilingUsd,
              idempotencyKey: reservationKey,
              jobId: reviewTask.jobId,
              spendCeiling: app.services.spendCeiling,
              task: reviewTask
            });
            reservationCreated = true;
            const dispatchResult =
              await app.services.providerDispatchWorker.dispatch(reviewTask);
            reviewTask.providerTaskRef = dispatchResult.providerTaskId;
            reviewTask.state = "dispatched";
            await app.services.humanReviewTaskService.save(reviewTask);
            providerTaskId = dispatchResult.providerTaskId;
            dispatchStatus = "dispatched";
          }
        } else if (
          app.services.runtimeConfig.localProviderMode === "simulated" &&
          reviewTask.reviewerPool !== "internal"
        ) {
          await app.services.queueStore.enqueue({
            attemptCount: 0,
            availableAt: new Date(),
            claimId: `provider-dispatch:${reviewTask.reviewTaskId}`,
            jobId: reviewTask.jobId,
            jobName: localQueueJobNames.providerDispatch,
            payloadJson: JSON.stringify(reviewTask),
            state: "queued"
          });
        }

        return reply.code(202).send({
          dispatch_status: dispatchStatus,
          job_id: reviewTask.jobId,
          provider_adapter: reviewTask.providerAdapter,
          provider_task_id: providerTaskId,
          review_task_id: reviewTask.reviewTaskId,
          reviewer_pool: reviewTask.reviewerPool
        });
      } catch (error) {
        const ambiguousDispatch =
          error instanceof ProviderDispatchError && error.ambiguous;
        if (
          reservationCreated &&
          reservationKey &&
          !providerTaskId &&
          !ambiguousDispatch
        ) {
          app.services.spendCeiling.release(reservationKey);
        }
        if (ambiguousDispatch && dispatchedReviewTask) {
          return reply.code(202).send({
            dispatch_status: "unknown",
            job_id: dispatchedReviewTask.jobId,
            provider_adapter: dispatchedReviewTask.providerAdapter,
            provider_task_id: dispatchedReviewTask.providerTaskRef,
            review_task_id: dispatchedReviewTask.reviewTaskId,
            reviewer_pool: dispatchedReviewTask.reviewerPool
          });
        }
        const message =
          error instanceof Error ? error.message : "Human review task rejected";
        const policyRejection =
          error instanceof PrivacyPolicyError ||
          message.includes("Invalid job state transition: fail_closed") ||
          message.includes("Real spend") ||
          message.includes("idempotency key");
        return reply.code(policyRejection ? 403 : 502).send({ message });
      }
    }
  );

  app.post<{ Params: { reviewTaskId: string }; Body: HumanResponseBody }>(
    "/human-review-tasks/:reviewTaskId/responses",
    async (request, reply) => {
      try {
        await app.services.responseValidationService.record({
          responseId: `response_${crypto.randomUUID()}`,
          reviewTaskId: request.params.reviewTaskId,
          reviewerPseudonymousId: request.body.reviewer_pseudonymous_id,
          overallVerdict: request.body.overall_verdict,
          criterionResults: request.body.criterion_results.map((criterion) => ({
            confidence: criterion.confidence,
            criterionId: criterion.criterion_id,
            status: criterion.status
          })),
          severity: request.body.severity,
          defectCategory: request.body.defect_category,
          confidence: request.body.confidence,
          artifactIssueFlags: [],
          evidenceNote: request.body.evidence_note,
          annotationRefs: [],
          qualityFlags: request.body.quality_flags ?? [],
          submittedAt: new Date()
        });

        return reply
          .code(202)
          .send({ review_task_id: request.params.reviewTaskId });
      } catch (error) {
        return reply.code(422).send({
          message:
            error instanceof Error
              ? error.message
              : "Invalid human review response"
        });
      }
    }
  );

  app.post<{ Params: { jobId: string }; Body: ConsensusBody }>(
    "/verification-jobs/:jobId/consensus",
    async (request, reply) => {
      try {
        const consensusId = `consensus_${crypto.randomUUID()}`;
        await app.services.consensusService.record({
          consensusId,
          jobId: request.params.jobId,
          reviewTaskId: request.body.review_task_id,
          validResponseCount: request.body.valid_response_count,
          quorumState: request.body.quorum_state,
          criterionProbabilities: {},
          severitySummary: request.body.severity_summary,
          artifactSufficiency: request.body.artifact_sufficiency,
          disagreementLevel: request.body.disagreement_level,
          recommendedOutcome: request.body.recommended_outcome,
          adjudicationTrigger: request.body.adjudication_trigger,
          createdAt: new Date()
        });

        return reply.code(202).send({ consensus_id: consensusId });
      } catch (error) {
        return reply.code(400).send({
          message:
            error instanceof Error ? error.message : "Invalid consensus result"
        });
      }
    }
  );

  app.post<{ Params: { jobId: string }; Body: AdjudicationBody }>(
    "/verification-jobs/:jobId/adjudications",
    async (request, reply) => {
      try {
        const adjudicationId = `adjudication_${crypto.randomUUID()}`;
        await app.services.adjudicationService.record({
          adjudicationId,
          jobId: request.params.jobId,
          triggerReason: request.body.trigger_reason,
          assignedPool: request.body.assigned_pool,
          normalizedEvidenceRefs: request.body.normalized_evidence_refs ?? [],
          decision: request.body.decision,
          decisionNotes: request.body.decision_notes,
          createdAt: new Date(),
          decidedAt: new Date()
        });

        return reply.code(202).send({ adjudication_id: adjudicationId });
      } catch (error) {
        return reply.code(400).send({
          message:
            error instanceof Error ? error.message : "Invalid adjudication case"
        });
      }
    }
  );
}
