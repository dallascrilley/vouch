import { createHash, timingSafeEqual } from "node:crypto";

import type { FastifyInstance } from "fastify";

import type { ProviderCallbackPayload } from "../../domain/human-review/provider-response-service.js";
import { shouldFallbackProvider } from "../../domain/human-review/provider-routing-policy.js";

type ProviderCallbackBody = ProviderCallbackPayload & {
  shared_secret?: string;
};

function secretsMatch(provided: string | undefined, expected: string): boolean {
  if (!provided) {
    return false;
  }
  // Hash to a fixed length so timingSafeEqual never throws on length mismatch
  // and the comparison time does not leak the secret length.
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export function registerProviderCallbackRoutes(app: FastifyInstance) {
  app.post<{ Body: ProviderCallbackBody }>(
    "/provider-callback",
    async (request, reply) => {
      try {
        const expectedSecret = app.services.providerConfig?.sharedSecret;
        // When a shared secret is configured the callback MUST present a matching
        // one. Omitting the field no longer skips the check (auth-bypass fix).
        if (expectedSecret) {
          if (!secretsMatch(request.body?.shared_secret, expectedSecret)) {
            return reply.code(401).send({
              message: "Invalid provider callback secret"
            });
          }
        }

        const ingested = await app.services.providerResponseService.ingest(
          request.body
        );
        const advanced =
          await app.services.providerWorkflowService.maybeAutoAdvanceAfterIngest(
            {
              deduplicated: ingested.deduplicated,
              response: ingested.response,
              reviewTaskId: ingested.reviewTaskId
            }
          );

        let pairwiseReviewTaskId: string | null = null;
        let pairwiseProviderTaskId: string | null = null;
        if (!advanced.advanced) {
          const pairwise =
            await app.services.providerWorkflowService.maybeQueuePairwiseTieBreak(
              {
                deduplicated: ingested.deduplicated,
                response: ingested.response,
                reviewTaskId: ingested.reviewTaskId
              }
            );

          if (pairwise.reviewTask) {
            pairwiseReviewTaskId = pairwise.reviewTask.reviewTaskId;
            const task = pairwise.reviewTask;
            if (
              app.services.providerConfig?.enabled &&
              task.providerAdapter === app.services.providerConfig.providerId &&
              app.services.providerDispatchWorker
            ) {
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
                pairwiseProviderTaskId = dispatchResult.providerTaskId;
              }
            }
          }
        }

        return reply.code(202).send({
          auto_advanced: advanced.advanced,
          deduplicated: ingested.deduplicated,
          pairwise_provider_task_id: pairwiseProviderTaskId,
          pairwise_queued: pairwiseReviewTaskId !== null,
          pairwise_review_task_id: pairwiseReviewTaskId,
          provider_response_id: ingested.receipt.providerResponseId,
          review_task_id: ingested.reviewTaskId
        });
      } catch (error) {
        return reply.code(422).send({
          message:
            error instanceof Error
              ? error.message
              : "Invalid provider callback payload"
        });
      }
    }
  );
}
