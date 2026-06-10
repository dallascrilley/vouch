import type { FastifyInstance } from "fastify";

import { buildReleaseArtifact } from "../../domain/feedback/release-artifact.js";

export function registerReleaseArtifactRoutes(app: FastifyInstance) {
  app.get<{ Params: { jobId: string } }>(
    "/verification-jobs/:jobId/release-artifact",
    async (request, reply) => {
      const signingKey = app.services.runtimeConfig.releaseGateSigningKey;
      if (!signingKey) {
        return reply.code(503).send({
          message: "Release artifacts are disabled: set RELEASE_GATE_SIGNING_KEY to enable signing"
        });
      }

      const { jobId } = request.params;
      const verdict = await app.services.verdictRepository.findByJobId(jobId);
      if (!verdict) {
        return reply.code(404).send({ message: "Verdict not available" });
      }

      const ledger = await app.services.runtimeRepositories.ledgerRepository.listByJobId(jobId);

      return buildReleaseArtifact({
        ledger,
        signedAt: new Date(),
        signingKey,
        verdict
      });
    }
  );
}
