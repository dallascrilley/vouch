import { createHash, timingSafeEqual } from "node:crypto";

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

function tokensMatch(provided: string | undefined, expected: string): boolean {
  if (!provided) {
    return false;
  }
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Guards the runtime inspection endpoints, which expose internal state
 * (filesystem layout, ledger, privacy classifications, verdicts).
 *
 * - If RUNTIME_OPERATOR_TOKEN is configured, a matching `x-operator-token`
 *   header is required.
 * - If it is NOT configured, the endpoints are refused in production so a
 *   misconfigured deploy cannot leak internal state unauthenticated. They
 *   remain open in non-production for local validation/dev ergonomics.
 *
 * Returns true when the request may proceed.
 */
function authorizeOperator(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply): boolean {
  const expected = app.services.runtimeConfig.operatorToken;

  if (!expected) {
    if (app.services.runtimeConfig.nodeEnv === "production") {
      reply.code(503).send({
        message: "Runtime inspection is disabled: set RUNTIME_OPERATOR_TOKEN to enable it"
      });
      return false;
    }
    return true;
  }

  const provided = request.headers["x-operator-token"];
  if (typeof provided !== "string" || !tokensMatch(provided, expected)) {
    reply.code(401).send({ message: "Invalid or missing operator token" });
    return false;
  }
  return true;
}

export function registerRuntimeOperationsRoutes(app: FastifyInstance) {
  app.get("/runtime/inspection", (request, reply) => {
    if (!authorizeOperator(app, request, reply)) {
      return reply;
    }
    return {
      artifact_root: app.services.runtimeConfig.artifactRoot,
      database_path: app.services.runtimeConfig.databasePath,
      queue_claim_ttl_seconds: app.services.runtimeConfig.queueClaimTtlSeconds
    };
  });

  app.get<{ Params: { jobId: string } }>("/runtime/inspection/jobs/:jobId", async (request, reply) => {
    if (!authorizeOperator(app, request, reply)) {
      return reply;
    }

    const { jobId } = request.params;
    const job = await app.services.jobService.get(jobId);

    if (!job) {
      return reply.code(404).send({ message: "Job not found" });
    }

    const [privacy, selfVerification, reviewTasks, consensus, adjudication, verdict, feedback, ledger] =
      await Promise.all([
        app.services.runtimeRepositories.privacyClassificationRepository.findByJobId(jobId),
        app.services.runtimeRepositories.selfVerificationResultRepository.findByJobId(jobId),
        app.services.runtimeRepositories.humanReviewTaskRepository.findByJobId(jobId),
        app.services.runtimeRepositories.consensusResultRepository.findByJobId(jobId),
        app.services.runtimeRepositories.adjudicationCaseRepository.findByJobId(jobId),
        app.services.runtimeRepositories.finalVerdictRepository.findByJobId(jobId),
        app.services.runtimeRepositories.feedbackRepository.findByJobId(jobId),
        app.services.runtimeRepositories.ledgerRepository.listByJobId(jobId)
      ]);

    return {
      adjudication,
      consensus,
      feedback,
      job,
      ledger,
      privacy,
      review_tasks: reviewTasks,
      self_verification: selfVerification,
      verdict
    };
  });
}
