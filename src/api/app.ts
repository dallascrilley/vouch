import Fastify, { type FastifyInstance } from "fastify";

import { publicProviderCapability } from "../adapters/providers/public-provider-adapter.js";
import { internalReviewerCapability } from "../adapters/providers/internal-reviewer-adapter.js";
import {
  createSQLiteRuntimeRepositories,
  SQLiteLocalQueueStore,
  type SQLiteRuntimeRepositories
} from "../adapters/storage/sqlite-repositories.js";
import type { TransactionManager } from "../adapters/storage/transaction-manager.js";
import { ArtifactService } from "../domain/artifacts/artifact-service.js";
import { AdjudicationService } from "../domain/adjudication/adjudication-service.js";
import { ConsensusService } from "../domain/consensus/consensus-service.js";
import type { AgentFeedbackRepository, FinalVerdictRepository } from "../adapters/storage/repositories.js";
import { FeedbackService } from "../domain/feedback/feedback-service.js";
import { VerdictService } from "../domain/feedback/verdict-service.js";
import { HumanReviewTaskService } from "../domain/human-review/human-review-task-service.js";
import { ProviderCapabilityRegistry } from "../domain/human-review/provider-capability-registry.js";
import { ResponseValidationService } from "../domain/human-review/response-validation-service.js";
import { JobService } from "../domain/jobs/job-service.js";
import { AcceptanceCriteriaService } from "../domain/jobs/acceptance-criteria-service.js";
import { LedgerService } from "../domain/ledger/ledger-service.js";
import { PrivacyGate } from "../domain/privacy/privacy-gate.js";
import { SelfVerificationService } from "../domain/self-verification/self-verification-service.js";
import { loadRuntimeConfig, type RuntimeConfig } from "../config/runtime.js";
import { validateRuntimeConfig } from "../config/runtime-validation.js";
import { registerEvidenceRoutes } from "./routes/evidence.js";
import { registerHumanReviewRoutes } from "./routes/human-review.js";
import { registerRuntimeOperationsRoutes } from "./routes/runtime-operations.js";
import { registerVerificationJobRoutes } from "./routes/verification-jobs.js";
import { registerVerdictFeedbackRoutes } from "./routes/verdict-feedback.js";

export type AppServices = {
  adjudicationService: AdjudicationService;
  artifactService: ArtifactService;
  consensusService: ConsensusService;
  feedbackRepository: AgentFeedbackRepository;
  humanReviewTaskService: HumanReviewTaskService;
  jobService: JobService;
  privacyGate: PrivacyGate;
  queueStore: SQLiteLocalQueueStore;
  responseValidationService: ResponseValidationService;
  runtimeConfig: RuntimeConfig;
  runtimeRepositories: SQLiteRuntimeRepositories;
  selfVerificationService: SelfVerificationService;
  verdictRepository: FinalVerdictRepository;
  transactionManager: TransactionManager;
};

declare module "fastify" {
  interface FastifyInstance {
    services: AppServices;
  }
}

export function buildApp(configOverride?: RuntimeConfig): FastifyInstance {
  const config = configOverride ?? loadRuntimeConfig();
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
    publicProviderCapability
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
    transactionManager
  );

  app.decorate("services", {
    adjudicationService,
    artifactService,
    consensusService,
    feedbackRepository: repositories.feedbackRepository,
    humanReviewTaskService,
    jobService,
    privacyGate,
    queueStore,
    responseValidationService,
    runtimeConfig: config,
    runtimeRepositories: repositories,
    selfVerificationService,
    transactionManager,
    verdictRepository: repositories.finalVerdictRepository
  });

  app.addHook("onClose", () => {
    repositories.store.close();
  });

  app.get("/health", () => ({
    database_path: config.databasePath,
    local_provider_mode: config.localProviderMode,
    status: "ok"
  }));

  void registerVerificationJobRoutes(app);
  void registerEvidenceRoutes(app);
  void registerHumanReviewRoutes(app);
  void registerVerdictFeedbackRoutes(app);
  void registerRuntimeOperationsRoutes(app);

  return app;
}
