import { createHash, timingSafeEqual } from "node:crypto";

import type { FastifyInstance } from "fastify";

import type { ProviderCallbackPayload } from "../../domain/human-review/provider-response-service.js";

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
  app.post<{ Body: ProviderCallbackBody }>("/provider-callback", async (request, reply) => {
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

      const ingested = await app.services.providerResponseService.ingest(request.body);
      return reply.code(202).send({
        provider_response_id: ingested.receipt.providerResponseId,
        review_task_id: ingested.reviewTaskId,
        deduplicated: ingested.deduplicated
      });
    } catch (error) {
      return reply.code(422).send({
        message: error instanceof Error ? error.message : "Invalid provider callback payload"
      });
    }
  });
}
