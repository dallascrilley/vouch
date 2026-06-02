import type { FastifyInstance } from "fastify";

import type { ProviderCallbackPayload } from "../../domain/human-review/provider-response-service.js";

type ProviderCallbackBody = ProviderCallbackPayload & {
  shared_secret?: string;
};

export function registerProviderCallbackRoutes(app: FastifyInstance) {
  app.post<{ Body: ProviderCallbackBody }>("/provider-callback", async (request, reply) => {
    try {
      if (
        request.body.shared_secret &&
        request.body.shared_secret !== app.services.providerConfig?.sharedSecret
      ) {
        return reply.code(401).send({
          message: "Invalid provider callback secret"
        });
      }

      const ingested = await app.services.providerResponseService.ingest(request.body);
      return reply.code(202).send({
        provider_response_id: ingested.receipt.providerResponseId,
        review_task_id: ingested.response.reviewTaskId
      });
    } catch (error) {
      return reply.code(422).send({
        message: error instanceof Error ? error.message : "Invalid provider callback payload"
      });
    }
  });
}
