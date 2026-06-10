import Fastify, { type FastifyInstance } from "fastify";

import { internalReviewerCapability } from "../adapters/providers/internal-reviewer-adapter.js";
import {
  publicProviderCapability,
  realProviderCapability
} from "../adapters/providers/public-provider-adapter.js";
import { RealProviderAdapter } from "../adapters/providers/real-provider-adapter.js";
import {
  SQLiteProviderResponseReceiptRepository,
  SQLiteProviderStateStore,
  SQLiteProviderTaskMappingRepository
} from "../adapters/storage/provider-sqlite-repositories.js";
import type {
  AgentFeedbackRepository,
  FinalVerdictRepository,
  ProviderConfigRepository,
  ProviderResponseReceiptRepository,
  ProviderTaskMappingRepository
} from "../adapters/storage/repositories.js";
import {
  createSQLiteRuntimeRepositories,
  SQLiteLocalQueueStore,
  type SQLiteRuntimeRepositories
} from "../adapters/storage/sqlite-repositories.js";
import type { TransactionManager } from "../adapters/storage/transaction-manager.js";
import { AdjudicationService } from "../domain/adjudication/adjudication-service.js";
import { ArtifactService } from "../domain/artifacts/artifact-service.js";
import { ConsensusService } from "../domain/consensus/consensus-service.js";
import { FeedbackService } from "../domain/feedback/feedback-service.js";
import { VerdictService } from "../domain/feedback/verdict-service.js";
import { HumanReviewTaskService } from "../domain/human-review/human-review-task-service.js";
import type {
  ProviderAdapterConfig,
  ProviderResponseReceipt,
  ProviderTaskMapping
} from "../domain/human-review/models.js";
import { ProviderCapabilityRegistry } from "../domain/human-review/provider-capability-registry.js";
import { ProviderConfigService } from "../domain/human-review/provider-config-service.js";
import { ProviderOperationsService } from "../domain/human-review/provider-operations-service.js";
import { ProviderResponseService } from "../domain/human-review/provider-response-service.js";
import { ProviderTaskMappingService } from "../domain/human-review/provider-task-mapping-service.js";
import { ProviderWorkflowService } from "../domain/human-review/provider-workflow-service.js";
import { ResponseValidationService } from "../domain/human-review/response-validation-service.js";
import { AcceptanceCriteriaService } from "../domain/jobs/acceptance-criteria-service.js";
import { JobService } from "../domain/jobs/job-service.js";
import { LedgerService } from "../domain/ledger/ledger-service.js";
import { PrivacyGate } from "../domain/privacy/privacy-gate.js";
import { SelfVerificationService } from "../domain/self-verification/self-verification-service.js";
import {
  buildDefaultProviderHealthStates,
  loadDefaultProviderConfig
} from "../config/policies.js";
import { validateProviderConfig } from "../config/provider-config.js";
import { loadRuntimeConfig, type RuntimeConfig } from "../config/runtime.js";
import { validateRuntimeConfig } from "../config/runtime-validation.js";
import { ProviderDispatchWorker } from "../workers/provider-dispatch-worker.js";
import { registerEvidenceRoutes } from "./routes/evidence.js";
import { registerHumanReviewRoutes } from "./routes/human-review.js";
import { registerProviderCallbackRoutes } from "./routes/provider-callback.js";
import { registerReleaseArtifactRoutes } from "./routes/release-artifact.js";
import { registerRuntimeOperationsRoutes } from "./routes/runtime-operations.js";
import { registerStuckStateRoutes } from "./routes/stuck-state.js";
import { registerVerificationJobRoutes } from "./routes/verification-jobs.js";
import { registerVerdictFeedbackRoutes } from "./routes/verdict-feedback.js";

type BuildAppOptions = {
  config?: RuntimeConfig;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
};

class InMemoryProviderConfigRepository implements ProviderConfigRepository {
  constructor(private readonly configs = new Map<string, ProviderAdapterConfig>()) {}

  get(providerId: string) {
    return Promise.resolve(this.configs.get(providerId) ?? null);
  }

  save(config: ProviderAdapterConfig) {
    this.configs.set(config.providerId, config);
    return Promise.resolve();
  }
}

class InMemoryProviderTaskMappingRepository implements ProviderTaskMappingRepository {
  private readonly mappings = new Map<string, ProviderTaskMapping>();
  private readonly taskIds = new Map<string, string>();

  findByProviderTaskId(providerTaskId: string) {
    const reviewTaskId = this.taskIds.get(providerTaskId);
    return Promise.resolve(reviewTaskId ? this.mappings.get(reviewTaskId) ?? null : null);
  }

  findByReviewTaskId(reviewTaskId: string) {
    return Promise.resolve(this.mappings.get(reviewTaskId) ?? null);
  }

  save(mapping: ProviderTaskMapping) {
    this.mappings.set(mapping.reviewTaskId, mapping);
    this.taskIds.set(mapping.providerTaskId, mapping.reviewTaskId);
    return Promise.resolve();
  }
}

class InMemoryProviderResponseReceiptRepository
  implements ProviderResponseReceiptRepository
{
  private readonly receipts = new Map<string, ProviderResponseReceipt>();

  findByDedupeKey(dedupeKey: string) {
    return Promise.resolve(this.receipts.get(dedupeKey) ?? null);
  }

  save(receipt: ProviderResponseReceipt) {
    this.receipts.set(receipt.dedupeKey, receipt);
    return Promise.resolve();
  }
}

export type AppServices = {
  adjudicationService: AdjudicationService;
  artifactService: ArtifactService;
  consensusService: ConsensusService;
  feedbackRepository: AgentFeedbackRepository;
  humanReviewTaskService: HumanReviewTaskService;
  jobService: JobService;
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
  const env = options?.env ?? process.env;
  return {
    config: options?.config ?? loadRuntimeConfig(env),
    env,
    fetchImpl: options?.fetchImpl
  };
}

export function buildApp(input?: RuntimeConfig | BuildAppOptions): FastifyInstance {
  const { config, env, fetchImpl } = resolveConfig(input);
  validateRuntimeConfig(config);

  const app = Fastify({
    logger: {
      level: config.logLevel
    }
  });

  const repositories = createSQLiteRuntimeRepositories(config.databasePath);
  const queueStore = new SQLiteLocalQueueStore(repositories.store);
  const transactionManager = repositories.store;

  const acceptanceCriteriaService = new AcceptanceCriteriaService();
  const jobService = new JobService(
    repositories.jobRepository,
    repositories.acceptanceCriterionRepository,
    acceptanceCriteriaService
  );
  const ledgerService = new LedgerService(repositories.ledgerRepository);
  const verdictService = new VerdictService(
    repositories.finalVerdictRepository,
    jobService,
    ledgerService,
    transactionManager
  );
  const feedbackService = new FeedbackService(repositories.feedbackRepository);
  const artifactService = new ArtifactService(
    repositories.artifactManifestRepository,
    jobService,
    ledgerService,
    transactionManager
  );
  const providerCapabilityRegistry = new ProviderCapabilityRegistry([
    internalReviewerCapability,
    publicProviderCapability,
    realProviderCapability
  ]);
  const humanReviewTaskService = new HumanReviewTaskService(
    repositories.humanReviewTaskRepository,
    jobService,
    ledgerService,
    providerCapabilityRegistry,
    transactionManager
  );
  const responseValidationService = new ResponseValidationService(
    repositories.humanResponseRepository,
    repositories.humanReviewTaskRepository,
    jobService,
    ledgerService,
    transactionManager
  );
  const consensusService = new ConsensusService(
    repositories.consensusResultRepository,
    repositories.humanResponseRepository,
    repositories.humanReviewTaskRepository,
    jobService,
    ledgerService,
    transactionManager
  );
  const adjudicationService = new AdjudicationService(
    repositories.adjudicationCaseRepository,
    repositories.consensusResultRepository,
    repositories.humanResponseRepository,
    repositories.humanReviewTaskRepository,
    jobService,
    ledgerService,
    verdictService,
    feedbackService,
    transactionManager
  );
  const privacyGate = new PrivacyGate(
    repositories.privacyClassificationRepository,
    jobService,
    ledgerService,
    verdictService,
    feedbackService,
    transactionManager
  );
  const selfVerificationService = new SelfVerificationService(
    repositories.selfVerificationResultRepository,
    jobService,
    ledgerService,
    verdictService,
    feedbackService,
    transactionManager,
    humanReviewTaskService
  );

  const providerConfig = loadDefaultProviderConfig(env);
  const providerValidation = validateProviderConfig(providerConfig);
  if (!providerValidation.valid) {
    throw new Error(providerValidation.errors.join("; "));
  }

  const providerConfigRepository = new InMemoryProviderConfigRepository();
  void providerConfigRepository.save(providerConfig);
  const providerConfigService = new ProviderConfigService(providerConfigRepository);

  let providerStateStore: SQLiteProviderStateStore | undefined;
  const providerMappingRepository: ProviderTaskMappingRepository = config.providerStateDbPath
    ? ((providerStateStore = new SQLiteProviderStateStore(config.providerStateDbPath)),
      new SQLiteProviderTaskMappingRepository(providerStateStore))
    : new InMemoryProviderTaskMappingRepository();
  const providerReceiptRepository: ProviderResponseReceiptRepository = providerStateStore
    ? new SQLiteProviderResponseReceiptRepository(providerStateStore)
    : new InMemoryProviderResponseReceiptRepository();

  const providerMappingService = new ProviderTaskMappingService(
    providerMappingRepository,
    providerReceiptRepository
  );
  const providerOperationsService = new ProviderOperationsService(
    buildDefaultProviderHealthStates()
  );
  const providerResponseService = new ProviderResponseService(
    providerMappingService,
    responseValidationService
  );
  const providerWorkflowService = new ProviderWorkflowService(
    jobService,
    ledgerService,
    verdictService,
    feedbackService,
    repositories.humanReviewTaskRepository,
    transactionManager,
    repositories.humanResponseRepository,
    humanReviewTaskService
  );
  const providerDispatchWorker =
    providerConfig.enabled && providerConfig.providerId === "real-provider"
      ? new ProviderDispatchWorker(
          new RealProviderAdapter(providerConfig, fetchImpl),
          providerMappingService,
          providerOperationsService
        )
      : undefined;

  app.decorate("services", {
    adjudicationService,
    artifactService,
    consensusService,
    feedbackRepository: repositories.feedbackRepository,
    humanReviewTaskService,
    jobService,
    privacyGate,
    providerConfig,
    providerConfigService,
    providerDispatchWorker,
    providerMappingService,
    providerOperationsService,
    providerResponseService,
    providerWorkflowService,
    queueStore,
    responseValidationService,
    runtimeConfig: config,
    runtimeRepositories: repositories,
    selfVerificationService,
    transactionManager,
    verdictRepository: repositories.finalVerdictRepository
  });

  app.addHook("onClose", () => {
    providerStateStore?.close();
    repositories.store.close();
  });

  app.get("/health", () => ({
    database_path: config.databasePath,
    local_provider_mode: config.localProviderMode,
    provider_enabled: providerConfig.enabled,
    provider_id: providerConfig.providerId,
    status: "ok"
  }));

  void registerVerificationJobRoutes(app);
  void registerEvidenceRoutes(app);
  void registerHumanReviewRoutes(app);
  void registerVerdictFeedbackRoutes(app);
  void registerRuntimeOperationsRoutes(app);
  void registerProviderCallbackRoutes(app);
  void registerStuckStateRoutes(app);
  void registerReleaseArtifactRoutes(app);

  return app;
}
