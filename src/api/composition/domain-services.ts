import { InMemoryMetricsRecorder } from "../../adapters/observability/metrics.js";
import type { Metrics } from "../../adapters/observability/observability.js";
import { internalReviewerCapability } from "../../adapters/providers/internal-reviewer-adapter.js";
import {
  publicProviderCapability,
  realProviderCapability
} from "../../adapters/providers/public-provider-adapter.js";
import type { SQLiteRuntimeRepositories } from "../../adapters/storage/sqlite-repositories.js";
import type { TransactionManager } from "../../adapters/storage/transaction-manager.js";
import type { RuntimeConfig } from "../../config/runtime.js";
import { AdjudicationService } from "../../domain/adjudication/adjudication-service.js";
import { ArtifactService } from "../../domain/artifacts/artifact-service.js";
import { ConsensusService } from "../../domain/consensus/consensus-service.js";
import { FeedbackService } from "../../domain/feedback/feedback-service.js";
import { VerdictService } from "../../domain/feedback/verdict-service.js";
import { HumanReviewTaskService } from "../../domain/human-review/human-review-task-service.js";
import { ProviderCapabilityRegistry } from "../../domain/human-review/provider-capability-registry.js";
import { ResponseValidationService } from "../../domain/human-review/response-validation-service.js";
import { AcceptanceCriteriaService } from "../../domain/jobs/acceptance-criteria-service.js";
import { JobService } from "../../domain/jobs/job-service.js";
import { LedgerService } from "../../domain/ledger/ledger-service.js";
import { PrivacyGate } from "../../domain/privacy/privacy-gate.js";
import { SelfVerificationService } from "../../domain/self-verification/self-verification-service.js";

export type DomainServices = {
  adjudicationService: AdjudicationService;
  artifactService: ArtifactService;
  consensusService: ConsensusService;
  feedbackService: FeedbackService;
  humanReviewTaskService: HumanReviewTaskService;
  jobService: JobService;
  ledgerService: LedgerService;
  metrics: Metrics;
  privacyGate: PrivacyGate;
  responseValidationService: ResponseValidationService;
  selfVerificationService: SelfVerificationService;
  verdictService: VerdictService;
};

export type DomainServicesInput = {
  config: RuntimeConfig;
  env: NodeJS.ProcessEnv;
  repositories: SQLiteRuntimeRepositories;
  transactionManager: TransactionManager;
};

/**
 * Builds the domain service graph. Construction order matters only in that
 * every service is handed its dependencies explicitly; there is no ambient
 * container and no registration order to get wrong.
 */
export function createDomainServices({
  config,
  env,
  repositories,
  transactionManager
}: DomainServicesInput): DomainServices {
  const metrics = new InMemoryMetricsRecorder();
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
    transactionManager,
    // Kept as a raw env read to preserve behavior exactly. It duplicates
    // `providerConfig.enabled`, which is derived later from the same variable;
    // docs/decisions/0002 proposes retiring the duplication by moving provider
    // config into typed options.
    config.localProviderMode === "disabled" || env.PROVIDER_ENABLED !== "true"
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

  return {
    adjudicationService,
    artifactService,
    consensusService,
    feedbackService,
    humanReviewTaskService,
    jobService,
    ledgerService,
    metrics,
    privacyGate,
    responseValidationService,
    selfVerificationService,
    verdictService
  };
}
