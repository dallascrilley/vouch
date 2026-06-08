import type { FastifyInstance } from "fastify";

import type { AdjudicationDecision, ConsensusOutcome } from "../../domain/consensus/models.js";
import type { ProviderCallbackPayload } from "../../domain/human-review/provider-response-service.js";
import type { Severity } from "../../domain/human-review/models.js";

type ProviderCallbackBody = ProviderCallbackPayload & {
  shared_secret?: string;
};

function toConsensusOutcome(verdict: ProviderCallbackPayload["overall_verdict"]): ConsensusOutcome {
  switch (verdict) {
    case "pass":
      return "pass";
    case "fail":
      return "fail";
    case "artifact_insufficient":
      return "recapture";
    case "unclear":
      return "retry";
  }
}

function toAdjudicationDecision(verdict: ProviderCallbackPayload["overall_verdict"]): AdjudicationDecision {
  switch (verdict) {
    case "pass":
      return "pass";
    case "fail":
      return "fail";
    case "artifact_insufficient":
      return "recapture";
    case "unclear":
      return "retry";
  }
}

function toSeveritySummary(payload: ProviderCallbackPayload): Severity | "none" {
  return payload.overall_verdict === "pass" ? "none" : payload.severity;
}

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
      const reviewTask = await app.services.runtimeRepositories.humanReviewTaskRepository.findById(
        ingested.response.reviewTaskId
      );
      if (!reviewTask) {
        throw new Error(`Human review task not found: ${ingested.response.reviewTaskId}`);
      }
      const consensusId = `consensus_${crypto.randomUUID()}`;
      const artifactInsufficient = request.body.overall_verdict === "artifact_insufficient";
      await app.services.consensusService.record({
        consensusId,
        jobId: reviewTask.jobId,
        reviewTaskId: ingested.response.reviewTaskId,
        validResponseCount: 1,
        quorumState: "met",
        criterionProbabilities: {},
        severitySummary: toSeveritySummary(request.body),
        artifactSufficiency: artifactInsufficient ? "insufficient" : "sufficient",
        disagreementLevel: request.body.overall_verdict === "pass" ? "none" : "low",
        recommendedOutcome: toConsensusOutcome(request.body.overall_verdict),
        adjudicationTrigger: "provider_callback_auto_resolution",
        createdAt: new Date()
      });

      const adjudicationId = `adjudication_${crypto.randomUUID()}`;
      await app.services.adjudicationService.record({
        adjudicationId,
        jobId: reviewTask.jobId,
        triggerReason: "provider_callback_auto_resolution",
        assignedPool: "managed",
        normalizedEvidenceRefs: [request.body.provider_response_id],
        decision: toAdjudicationDecision(request.body.overall_verdict),
        decisionNotes: request.body.evidence_note,
        createdAt: new Date(),
        decidedAt: new Date()
      });

      return reply.code(202).send({
        adjudication_id: adjudicationId,
        consensus_id: consensusId,
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
