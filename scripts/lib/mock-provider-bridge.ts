import Fastify, { type FastifyInstance } from "fastify";

import {
  deliverProviderCallback,
  loadBridgeState,
  saveBridgeState,
  summarizeBridgeState,
  type BridgeDispatchBody,
  type BridgeTaskRecord,
  type ProviderBridgeCallbackPayload
} from "./provider-bridge.js";

export type MockProviderBridgeConfig = {
  apiKey: string;
  brokerCallbackUrl: string;
  fetchImpl?: typeof fetch;
  maxCallbackAttempts: number;
  providerId: string;
  sharedSecret: string;
  statePath: string;
};

type MockProviderResponseBody = {
  criterion_results?: ProviderBridgeCallbackPayload["criterion_results"];
  defect_category?: string;
  evidence_note?: string;
  overall_verdict?: "pass" | "fail" | "unclear" | "artifact_insufficient";
  provider_response_id?: string;
  provider_task_id: string;
  quality_flags?: string[];
  reviewer_pseudonymous_id?: string;
  severity?: "S0" | "S1" | "S2" | "S3" | "S4";
};

export function buildMockProviderBridge(
  config: MockProviderBridgeConfig
): FastifyInstance {
  const app = Fastify({ logger: true });

  app.get("/health", () => ({ ok: true, provider_id: config.providerId }));

  app.get("/state", (request, reply) => {
    if (!isAuthorized(request.headers.authorization, config.apiKey)) {
      return reply.code(401).send({ message: "Invalid bridge authorization" });
    }

    return summarizeBridgeState(loadBridgeState(config.statePath));
  });

  app.post<{ Body: BridgeDispatchBody }>(
    "/dispatch",
    async (request, reply) => {
      if (!isAuthorized(request.headers.authorization, config.apiKey)) {
        return reply
          .code(401)
          .send({ message: "Invalid bridge authorization" });
      }

      const providerTaskId = `mock_task_${request.body.review_task_id}`;
      const state = loadBridgeState(config.statePath);
      state.tasks[providerTaskId] = createTaskRecord({
        body: request.body,
        providerTaskId
      });
      saveBridgeState(config.statePath, state);

      app.log.info(
        {
          providerTaskId,
          reviewTaskId: request.body.review_task_id,
          reviewerPool: request.body.reviewer_pool
        },
        "mock provider bridge dispatched task"
      );

      return reply.code(202).send({
        provider_assignment_scope: request.body.reviewer_pool,
        provider_task_id: providerTaskId
      });
    }
  );

  app.post<{ Body: MockProviderResponseBody }>(
    "/responses",
    async (request, reply) => {
      if (!isAuthorized(request.headers.authorization, config.apiKey)) {
        return reply
          .code(401)
          .send({ message: "Invalid bridge authorization" });
      }

      const state = loadBridgeState(config.statePath);
      const task = state.tasks[request.body.provider_task_id];
      if (!task) {
        return reply.code(404).send({
          message: `Provider task not found: ${request.body.provider_task_id}`
        });
      }

      const responseId =
        request.body.provider_response_id ??
        `mock_response_${crypto.randomUUID()}`;
      if (task.deliveredAssignmentIds.includes(responseId)) {
        return reply.code(200).send({
          delivered: true,
          duplicate: true,
          provider_response_id: responseId,
          provider_task_id: request.body.provider_task_id
        });
      }

      const delivery = await deliverProviderCallback({
        brokerCallbackUrl: config.brokerCallbackUrl,
        fetchImpl: config.fetchImpl,
        maxCallbackAttempts: config.maxCallbackAttempts,
        payload: buildCallbackPayload({
          body: request.body,
          config,
          responseId,
          task
        }),
        responseId,
        save: () => saveBridgeState(config.statePath, state),
        sharedSecret: config.sharedSecret,
        task,
        workerId: request.body.reviewer_pseudonymous_id
      });

      app.log.info(
        {
          delivered: delivery.delivered,
          providerResponseId: responseId,
          providerTaskId: request.body.provider_task_id,
          reviewTaskId: task.reviewTaskId
        },
        "mock provider bridge processed response"
      );

      return reply.code(delivery.delivered ? 202 : 502).send({
        ...delivery,
        provider_response_id: responseId,
        provider_task_id: request.body.provider_task_id
      });
    }
  );

  return app;
}

function isAuthorized(authorization: string | undefined, apiKey: string) {
  return authorization === `Bearer ${apiKey}`;
}

function createTaskRecord(input: {
  body: BridgeDispatchBody;
  providerTaskId: string;
}): BridgeTaskRecord {
  return {
    approvedAssignmentIds: [],
    callbackAttempts: {},
    createdAt: new Date().toISOString(),
    criterionIds: input.body.criterion_ids,
    deadLetterAssignments: [],
    deliveredAssignmentIds: [],
    hitId: input.providerTaskId,
    reviewTaskId: input.body.review_task_id,
    reviewerPool: input.body.reviewer_pool,
    sanitizedPackageId: input.body.sanitized_package_id,
    taskTemplate: input.body.task_template
  };
}

function buildCallbackPayload(input: {
  body: MockProviderResponseBody;
  config: MockProviderBridgeConfig;
  responseId: string;
  task: BridgeTaskRecord;
}): ProviderBridgeCallbackPayload {
  const verdict = input.body.overall_verdict ?? "pass";
  return {
    criterion_results:
      input.body.criterion_results ??
      input.task.criterionIds.map((criterionId) => ({
        criterion_id: criterionId,
        confidence: "high",
        status: verdict === "pass" ? "pass" : "unclear"
      })),
    defect_category:
      input.body.defect_category ??
      (verdict === "pass" ? "none" : "mock_provider_review"),
    delivery_mode: "callback",
    evidence_note:
      input.body.evidence_note ??
      `Mock provider response for ${input.task.reviewTaskId}.`,
    overall_verdict: verdict,
    provider_assignment_ref: input.task.reviewerPool,
    provider_id: input.config.providerId,
    provider_response_id: input.responseId,
    provider_task_id: input.body.provider_task_id,
    quality_flags: input.body.quality_flags ?? [],
    reviewer_pseudonymous_id:
      input.body.reviewer_pseudonymous_id ?? "mock-provider-worker",
    severity: input.body.severity ?? (verdict === "pass" ? "S4" : "S2")
  };
}
