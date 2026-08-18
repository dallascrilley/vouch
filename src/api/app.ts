import Fastify, { type FastifyInstance } from "fastify";

import type { Metrics } from "../adapters/observability/observability.js";
import type {
  AgentFeedbackRepository,
  FinalVerdictRepository
} from "../adapters/storage/repositories.js";
import type {
  SQLiteLocalQueueStore,
  SQLiteRuntimeRepositories
} from "../adapters/storage/sqlite-repositories.js";
import type { TransactionManager } from "../adapters/storage/transaction-manager.js";
import { loadRuntimeConfig, type RuntimeConfig } from "../config/runtime.js";
import { validateRuntimeConfig } from "../config/runtime-validation.js";
import type { AdjudicationService } from "../domain/adjudication/adjudication-service.js";
import type { ArtifactService } from "../domain/artifacts/artifact-service.js";
import type { ConsensusService } from "../domain/consensus/consensus-service.js";
import type { HumanReviewTaskService } from "../domain/human-review/human-review-task-service.js";
import type { ProviderAdapterConfig } from "../domain/human-review/models.js";
import type { ProviderConfigService } from "../domain/human-review/provider-config-service.js";
import type { ProviderOperationsService } from "../domain/human-review/provider-operations-service.js";
import type { ProviderResponseService } from "../domain/human-review/provider-response-service.js";
import type { ProviderTaskMappingService } from "../domain/human-review/provider-task-mapping-service.js";
import type { ProviderWorkflowService } from "../domain/human-review/provider-workflow-service.js";
import type { ResponseValidationService } from "../domain/human-review/response-validation-service.js";
import type { JobService } from "../domain/jobs/job-service.js";
import { createHealthProof } from "../domain/privacy/health-proof.js";
import type { PrivacyGate } from "../domain/privacy/privacy-gate.js";
import type { SelfVerificationService } from "../domain/self-verification/self-verification-service.js";
import type { ProviderDispatchWorker } from "../workers/provider-dispatch-worker.js";
import { createDomainServices } from "./composition/domain-services.js";
import { createProviderStack } from "./composition/provider-stack.js";
import { registerRoutes } from "./composition/routes.js";
import { createRuntimeStores } from "./composition/runtime-stores.js";
import { authorizeOperator } from "./routes/runtime-operations.js";
import type { SpendCeiling } from "./spend-ceiling.js";

type BuildAppOptions = {
  config?: RuntimeConfig;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
};

export type AppServices = {
  adjudicationService: AdjudicationService;
  artifactService: ArtifactService;
  consensusService: ConsensusService;
  feedbackRepository: AgentFeedbackRepository;
  humanReviewTaskService: HumanReviewTaskService;
  jobService: JobService;
  metrics: Metrics;
  privacyGate: PrivacyGate;
  providerConfig?: ProviderAdapterConfig;
  providerConfigService: ProviderConfigService;
  providerDispatchWorker?: ProviderDispatchWorker;
  providerMappingService: ProviderTaskMappingService;
  providerOperationsService: ProviderOperationsService;
  providerResponseService: ProviderResponseService;
  providerWorkflowService: ProviderWorkflowService;
  queueStore: SQLiteLocalQueueStore;
  responseValidationService: ResponseValidationService;
  spendCeiling: SpendCeiling;
  runtimeConfig: RuntimeConfig;
  runtimeRepositories: SQLiteRuntimeRepositories;
  selfVerificationService: SelfVerificationService;
  transactionManager: TransactionManager;
  verdictRepository: FinalVerdictRepository;
};

declare module "fastify" {
  interface FastifyInstance {
    services: AppServices;
  }
}

function resolveConfig(input?: RuntimeConfig | BuildAppOptions): {
  config: RuntimeConfig;
  env: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
} {
  if (input && "databasePath" in input) {
    return {
      config: input,
      env: process.env
    };
  }

  const options = input;
  // Layer the caller's env over the ambient one rather than replacing it. A
  // partial env used to drop `VITEST`, which silently switched the runtime from
  // `:memory:` to the on-disk `.runtime/local-runtime.sqlite` that `npm run
  // verify` and the offline harnesses also use.
  const env = options?.env ? { ...process.env, ...options.env } : process.env;
  return {
    config: options?.config ?? loadRuntimeConfig(env),
    env,
    fetchImpl: options?.fetchImpl
  };
}

/**
 * Composition root. Each `create*` call below owns one layer of the graph and
 * lives under `composition/`; this function only orders them and wires the
 * result onto Fastify. See `docs/decisions/0002-bootstrap-composition-root.md`.
 */
export function buildApp(
  input?: RuntimeConfig | BuildAppOptions
): FastifyInstance {
  const { config, env, fetchImpl } = resolveConfig(input);
  validateRuntimeConfig(config);
  if (config.nodeEnv === "production" && !config.operatorToken) {
    throw new Error(
      "RUNTIME_OPERATOR_TOKEN is required when NODE_ENV=production"
    );
  }

  const app = Fastify({
    logger: {
      level: config.logLevel
    }
  });

  const stores = createRuntimeStores(config);
  const domain = createDomainServices({
    config,
    env,
    repositories: stores.repositories,
    transactionManager: stores.transactionManager
  });
  const provider = createProviderStack({
    config,
    domain,
    env,
    fetchImpl,
    repositories: stores.repositories,
    transactionManager: stores.transactionManager
  });

  const services: AppServices = {
    adjudicationService: domain.adjudicationService,
    artifactService: domain.artifactService,
    consensusService: domain.consensusService,
    feedbackRepository: stores.repositories.feedbackRepository,
    humanReviewTaskService: domain.humanReviewTaskService,
    jobService: domain.jobService,
    metrics: domain.metrics,
    privacyGate: domain.privacyGate,
    providerConfig: provider.providerConfig,
    providerConfigService: provider.providerConfigService,
    providerDispatchWorker: provider.providerDispatchWorker,
    providerMappingService: provider.providerMappingService,
    providerOperationsService: provider.providerOperationsService,
    providerResponseService: provider.providerResponseService,
    providerWorkflowService: provider.providerWorkflowService,
    queueStore: stores.queueStore,
    responseValidationService: domain.responseValidationService,
    spendCeiling: stores.spendCeiling,
    runtimeConfig: config,
    runtimeRepositories: stores.repositories,
    selfVerificationService: domain.selfVerificationService,
    transactionManager: stores.transactionManager,
    verdictRepository: stores.repositories.finalVerdictRepository
  };
  app.decorate("services", services);

  // The spawned broker is a local control plane, not an open localhost API.
  // Provider callbacks authenticate with their separate shared secret and are
  // intentionally exempt from the operator-token gate.
  app.addHook("onRequest", async (request, reply) => {
    const pathname = request.url.split("?", 1)[0];
    if (pathname === "/provider-callback" || pathname === "/health") return;
    if (!authorizeOperator(app, request, reply)) return reply;
  });

  app.addHook("onClose", () => {
    provider.close();
    stores.close();
  });

  app.get("/health", (request, reply) => {
    const challenge = request.headers["x-health-challenge"];
    if (typeof challenge === "string" && challenge.length > 0) {
      return {
        broker_version: "vouch-broker-v1",
        health_proof: createHealthProof(config.operatorToken ?? "", challenge),
        local_provider_mode: config.localProviderMode,
        status: "ok"
      };
    }
    if (!authorizeOperator(app, request, reply)) {
      return reply;
    }
    app.services.metrics.increment("broker.health.requests");
    return {
      broker_version: "vouch-broker-v1",
      database_path: config.databasePath,
      docs_url: "docs/architecture/agent-loop-integration.md",
      local_provider_mode: config.localProviderMode,
      provider_enabled: provider.providerConfig.enabled,
      provider_id: provider.providerConfig.providerId,
      required_companion: provider.providerConfig.enabled
        ? "dispatch worker (npm run dev:worker)"
        : null,
      status: "ok"
    };
  });

  registerRoutes(app);

  return app;
}
