import type { FastifyInstance } from "fastify";

import type {
  ArtifactManifest,
  ArtifactQuality,
  ArtifactType
} from "../../domain/artifacts/models.js";
import { shouldFallbackProvider } from "../../domain/human-review/provider-routing-policy.js";
import { dispatchLocalProviderTask } from "../../workers/provider-dispatch-worker.js";
import type {
  DataClass,
  ExternalizationDecision,
  RedactionStatus
} from "../../domain/privacy/models.js";
import type { ReviewerPoolType } from "../../domain/shared/types.js";
import type {
  CriterionResult,
  RecommendedAction
} from "../../domain/self-verification/models.js";

type ArtifactBody = {
  manifest_id: string;
  job_id: string;
  raw_artifacts: Array<{
    artifact_id: string;
    artifact_type: ArtifactType;
    content_hash: string;
    provenance: string;
  }>;
  sanitized_packages?: Array<{
    package_id: string;
    package_hash: string;
    redaction_policy_version: string;
    transform_hash: string;
    externalization_decision: string;
  }>;
  artifact_quality: ArtifactQuality;
  environment: {
    repository: string;
    branch?: string;
    commit: string;
    environment: string;
    route: string;
  };
};

type PrivacyBody = {
  classification_id: string;
  job_id: string;
  artifact_manifest_id: string;
  data_class: DataClass;
  redaction_status: RedactionStatus;
  allowed_reviewer_routes?: ReviewerPoolType[];
  blocked_reasons?: string[];
  policy_version: string;
  externalization_decision: ExternalizationDecision;
  audit_record_id: string;
};

type SelfVerificationBody = {
  result_id: string;
  job_id: string;
  confidence: "low" | "medium" | "high";
  recommended_action: RecommendedAction;
  criterion_results: Array<{
    criterion_id: string;
    status: CriterionResult["status"];
    confidence: CriterionResult["confidence"];
  }>;
  failure_categories?: string[];
};

export function registerEvidenceRoutes(app: FastifyInstance) {
  app.post<{ Params: { jobId: string }; Body: ArtifactBody }>(
    "/verification-jobs/:jobId/artifacts",
    async (request, reply) => {
      const body = request.body;

      const manifest: ArtifactManifest = {
        manifestId: body.manifest_id,
        jobId: request.params.jobId,
        rawArtifacts: body.raw_artifacts.map((artifact) => ({
          artifactId: artifact.artifact_id,
          artifactType: artifact.artifact_type,
          contentHash: artifact.content_hash,
          provenance: artifact.provenance,
          capturedAt: new Date()
        })),
        sanitizedPackages: (body.sanitized_packages ?? []).map((entry) => ({
          packageId: entry.package_id,
          packageHash: entry.package_hash,
          redactionPolicyVersion: entry.redaction_policy_version,
          transformHash: entry.transform_hash,
          externalizationDecision: entry.externalization_decision
        })),
        artifactQuality: body.artifact_quality,
        environment: {
          repository: body.environment.repository,
          branch: body.environment.branch,
          commit: body.environment.commit,
          environment: body.environment.environment,
          route: body.environment.route,
          featureFlags: []
        },
        createdAt: new Date()
      };

      try {
        await app.services.artifactService.attach(manifest);
        return reply
          .code(202)
          .send({ manifest_id: manifest.manifestId, job_id: manifest.jobId });
      } catch (error) {
        return reply.code(400).send({
          message:
            error instanceof Error ? error.message : "Invalid artifact manifest"
        });
      }
    }
  );

  app.post<{ Params: { jobId: string }; Body: PrivacyBody }>(
    "/verification-jobs/:jobId/privacy-classification",
    async (request, reply) => {
      try {
        await app.services.privacyGate.record({
          classificationId: request.body.classification_id,
          jobId: request.params.jobId,
          artifactManifestId: request.body.artifact_manifest_id,
          dataClass: request.body.data_class,
          redactionStatus: request.body.redaction_status,
          allowedReviewerRoutes: request.body.allowed_reviewer_routes ?? [],
          blockedReasons: request.body.blocked_reasons ?? [],
          policyVersion: request.body.policy_version,
          externalizationDecision: request.body.externalization_decision,
          auditRecordId: request.body.audit_record_id
        });

        return reply
          .code(202)
          .send({ classification_id: request.body.classification_id });
      } catch (error) {
        return reply.code(422).send({
          message:
            error instanceof Error
              ? error.message
              : "Invalid privacy classification"
        });
      }
    }
  );

  app.post<{ Params: { jobId: string }; Body: SelfVerificationBody }>(
    "/verification-jobs/:jobId/self-verification-results",
    async (request, reply) => {
      try {
        const outcome = await app.services.selfVerificationService.record({
          resultId: request.body.result_id,
          jobId: request.params.jobId,
          checks: {
            artifactQuality: "sufficient",
            visual: [],
            text: [],
            layout: [],
            accessibility: [],
            runtime: [],
            trace: []
          },
          confidence: request.body.confidence,
          recommendedAction: request.body.recommended_action,
          criterionResults: request.body.criterion_results.map((criterion) => ({
            criterionId: criterion.criterion_id,
            status: criterion.status,
            confidence: criterion.confidence
          })),
          failureCategories: request.body.failure_categories ?? [],
          createdAt: new Date()
        });

        let providerTaskId: string | null = null;
        if (outcome.reviewTask) {
          const task = outcome.reviewTask;
          if (
            app.services.providerConfig?.enabled &&
            task.providerAdapter === app.services.providerConfig.providerId &&
            app.services.providerDispatchWorker
          ) {
            // Dispatch failures (privacy block, provider outage) leave the
            // task queued; the job stays observable via stuck-state instead of
            // failing the already-recorded self-verification result.
            try {
              await app.services.privacyGate.assertProviderDispatchAllowed(
                task.jobId,
                task.reviewerPool
              );

              const fallbackDecision = shouldFallbackProvider({
                health:
                  app.services.providerOperationsService.getHealthSnapshot(),
                preferredProviderId: app.services.providerConfig.providerId
              });

              if (!fallbackDecision.fallback) {
                const dispatchResult =
                  await app.services.providerDispatchWorker.dispatch(task);
                task.providerTaskRef = dispatchResult.providerTaskId;
                task.state = "dispatched";
                await app.services.humanReviewTaskService.save(task);
                providerTaskId = dispatchResult.providerTaskId;
              }
            } catch (dispatchError) {
              request.log.error(
                {
                  err: dispatchError,
                  jobId: task.jobId,
                  reviewTaskId: task.reviewTaskId
                },
                "self-verification escalation dispatch failed; task left queued"
              );
            }
          } else if (
            app.services.runtimeConfig.localProviderMode === "simulated" &&
            task.reviewerPool !== "internal"
          ) {
            // Local dev dogfood path: deliver a deterministic simulated
            // response synchronously and let the provider workflow close the
            // loop, so the verify gate is never left hanging without a worker.
            const simulated = await dispatchLocalProviderTask(
              app.services.responseValidationService,
              task
            );
            await app.services.providerWorkflowService.maybeAutoAdvanceAfterIngest(
              {
                deduplicated: false,
                response: simulated,
                reviewTaskId: task.reviewTaskId
              }
            );
          }
        }

        return reply.code(202).send({
          escalated: outcome.escalated,
          provider_task_id: providerTaskId,
          result_id: request.body.result_id,
          review_task_id: outcome.reviewTask?.reviewTaskId ?? null
        });
      } catch (error) {
        return reply.code(400).send({
          message:
            error instanceof Error
              ? error.message
              : "Invalid self-verification result"
        });
      }
    }
  );
}
