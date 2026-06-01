import type { FastifyInstance } from "fastify";

export function registerRuntimeOperationsRoutes(app: FastifyInstance) {
  app.get("/runtime/inspection", () => ({
    artifact_root: app.services.runtimeConfig.artifactRoot,
    database_path: app.services.runtimeConfig.databasePath,
    queue_claim_ttl_seconds: app.services.runtimeConfig.queueClaimTtlSeconds
  }));

  app.get<{ Params: { jobId: string } }>("/runtime/inspection/jobs/:jobId", async (request, reply) => {
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
