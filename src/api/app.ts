import Fastify, { type FastifyInstance } from "fastify";

import type {
  AcceptanceCriterionRepository,
  AdjudicationCaseRepository,
  AgentFeedbackRepository,
  ArtifactManifestRepository,
  ConsensusResultRepository,
  FinalVerdictRepository,
  HumanResponseRepository,
  HumanReviewTaskRepository,
  PrivacyClassificationRepository,
  SelfVerificationResultRepository,
  VerificationJobRepository,
  VerdictLedgerRepository
} from "../adapters/storage/repositories.js";
import { publicProviderCapability } from "../adapters/providers/public-provider-adapter.js";
import { internalReviewerCapability } from "../adapters/providers/internal-reviewer-adapter.js";
import type { ArtifactManifest } from "../domain/artifacts/models.js";
import { ArtifactService } from "../domain/artifacts/artifact-service.js";
import { AdjudicationService } from "../domain/adjudication/adjudication-service.js";
import { ConsensusService } from "../domain/consensus/consensus-service.js";
import type {
  AdjudicationCase,
  ConsensusResult
} from "../domain/consensus/models.js";
import { FeedbackService } from "../domain/feedback/feedback-service.js";
import type { AgentFeedbackSignal, FinalVerdict, VerdictLedgerEvent } from "../domain/feedback/models.js";
import { VerdictService } from "../domain/feedback/verdict-service.js";
import type { HumanResponse, HumanReviewTask } from "../domain/human-review/models.js";
import { HumanReviewTaskService } from "../domain/human-review/human-review-task-service.js";
import { ProviderCapabilityRegistry } from "../domain/human-review/provider-capability-registry.js";
import { ResponseValidationService } from "../domain/human-review/response-validation-service.js";
import { JobService } from "../domain/jobs/job-service.js";
import type { AcceptanceCriterion, VerificationJob } from "../domain/jobs/models.js";
import { AcceptanceCriteriaService } from "../domain/jobs/acceptance-criteria-service.js";
import { LedgerService } from "../domain/ledger/ledger-service.js";
import type { PrivacyClassification } from "../domain/privacy/models.js";
import { PrivacyGate } from "../domain/privacy/privacy-gate.js";
import type { SelfVerificationResult } from "../domain/self-verification/models.js";
import { SelfVerificationService } from "../domain/self-verification/self-verification-service.js";
import { loadRuntimeConfig } from "../config/runtime.js";
import { registerEvidenceRoutes } from "./routes/evidence.js";
import { registerHumanReviewRoutes } from "./routes/human-review.js";
import { registerVerificationJobRoutes } from "./routes/verification-jobs.js";
import { registerVerdictFeedbackRoutes } from "./routes/verdict-feedback.js";

class InMemoryJobRepository implements VerificationJobRepository {
  private readonly jobs = new Map<string, VerificationJob>();
  private readonly jobsByIdempotencyKey = new Map<string, string>();

  findById(jobId: string) {
    return Promise.resolve(this.jobs.get(jobId) ?? null);
  }

  findByIdempotencyKey(idempotencyKey: string) {
    const jobId = this.jobsByIdempotencyKey.get(idempotencyKey);
    return Promise.resolve(jobId ? this.jobs.get(jobId) ?? null : null);
  }

  save(job: VerificationJob) {
    this.jobs.set(job.jobId, job);
    this.jobsByIdempotencyKey.set(job.idempotencyKey, job.jobId);
    return Promise.resolve();
  }
}

class InMemoryAcceptanceCriterionRepository implements AcceptanceCriterionRepository {
  saveAll(criteria: AcceptanceCriterion[]) {
    void criteria;
    return Promise.resolve();
  }
}

class InMemoryArtifactManifestRepository implements ArtifactManifestRepository {
  private readonly manifests = new Map<string, ArtifactManifest>();

  findById(manifestId: string) {
    return Promise.resolve(this.manifests.get(manifestId) ?? null);
  }

  save(manifest: ArtifactManifest) {
    this.manifests.set(manifest.manifestId, manifest);
    return Promise.resolve();
  }
}

class InMemoryPrivacyClassificationRepository implements PrivacyClassificationRepository {
  private readonly classifications = new Map<string, PrivacyClassification>();

  save(classification: PrivacyClassification) {
    this.classifications.set(classification.jobId, classification);
    return Promise.resolve();
  }
}

class InMemorySelfVerificationResultRepository implements SelfVerificationResultRepository {
  private readonly results = new Map<string, SelfVerificationResult>();

  save(result: SelfVerificationResult) {
    this.results.set(result.jobId, result);
    return Promise.resolve();
  }
}

class InMemoryHumanReviewTaskRepository implements HumanReviewTaskRepository {
  private readonly reviewTasks = new Map<string, HumanReviewTask>();

  findById(reviewTaskId: string) {
    return Promise.resolve(this.reviewTasks.get(reviewTaskId) ?? null);
  }

  save(task: HumanReviewTask) {
    this.reviewTasks.set(task.reviewTaskId, task);
    return Promise.resolve();
  }
}

class InMemoryHumanResponseRepository implements HumanResponseRepository {
  private readonly responses = new Map<string, HumanResponse[]>();

  findByReviewTaskId(reviewTaskId: string) {
    return Promise.resolve(this.responses.get(reviewTaskId) ?? []);
  }

  save(response: HumanResponse) {
    const existingResponses = this.responses.get(response.reviewTaskId) ?? [];
    this.responses.set(response.reviewTaskId, [...existingResponses, response]);
    return Promise.resolve();
  }
}

class InMemoryConsensusResultRepository implements ConsensusResultRepository {
  private readonly results = new Map<string, string>();

  markAdjudicated(jobId: string) {
    this.results.set(jobId, "adjudicated");
    return Promise.resolve();
  }

  save(result: ConsensusResult) {
    this.results.set(result.jobId, result.consensusId);
    return Promise.resolve();
  }
}

class InMemoryAdjudicationCaseRepository implements AdjudicationCaseRepository {
  private readonly cases = new Map<string, string>();

  save(caseFile: AdjudicationCase) {
    this.cases.set(caseFile.jobId, caseFile.adjudicationId);
    return Promise.resolve();
  }
}

class InMemoryFinalVerdictRepository implements FinalVerdictRepository {
  private readonly verdicts = new Map<string, FinalVerdict>();

  save(verdict: FinalVerdict) {
    this.verdicts.set(verdict.jobId, verdict);
    return Promise.resolve();
  }

  findByJobId(jobId: string) {
    return Promise.resolve(this.verdicts.get(jobId) ?? null);
  }
}

class InMemoryAgentFeedbackRepository implements AgentFeedbackRepository {
  private readonly feedbackSignals = new Map<string, AgentFeedbackSignal>();

  save(signal: AgentFeedbackSignal) {
    this.feedbackSignals.set(signal.jobId, signal);
    return Promise.resolve();
  }

  findByJobId(jobId: string) {
    return Promise.resolve(this.feedbackSignals.get(jobId) ?? null);
  }
}

class InMemoryVerdictLedgerRepository implements VerdictLedgerRepository {
  readonly events: VerdictLedgerEvent[] = [];

  append(event: VerdictLedgerEvent) {
    this.events.push(event);
    return Promise.resolve();
  }
}

export type AppServices = {
  adjudicationService: AdjudicationService;
  artifactService: ArtifactService;
  consensusService: ConsensusService;
  feedbackRepository: InMemoryAgentFeedbackRepository;
  humanReviewTaskService: HumanReviewTaskService;
  jobService: JobService;
  privacyGate: PrivacyGate;
  responseValidationService: ResponseValidationService;
  selfVerificationService: SelfVerificationService;
  verdictRepository: InMemoryFinalVerdictRepository;
};

declare module "fastify" {
  interface FastifyInstance {
    services: AppServices;
  }
}

export function buildApp(): FastifyInstance {
  const config = loadRuntimeConfig();
  const app = Fastify({
    logger: {
      level: config.logLevel
    }
  });

  const jobRepository = new InMemoryJobRepository();
  const criterionRepository = new InMemoryAcceptanceCriterionRepository();
  const artifactRepository = new InMemoryArtifactManifestRepository();
  const privacyRepository = new InMemoryPrivacyClassificationRepository();
  const selfVerificationRepository = new InMemorySelfVerificationResultRepository();
  const reviewTaskRepository = new InMemoryHumanReviewTaskRepository();
  const responseRepository = new InMemoryHumanResponseRepository();
  const consensusRepository = new InMemoryConsensusResultRepository();
  const adjudicationRepository = new InMemoryAdjudicationCaseRepository();
  const verdictRepository = new InMemoryFinalVerdictRepository();
  const feedbackRepository = new InMemoryAgentFeedbackRepository();
  const ledgerRepository = new InMemoryVerdictLedgerRepository();

  const acceptanceCriteriaService = new AcceptanceCriteriaService();
  const jobService = new JobService(jobRepository, criterionRepository, acceptanceCriteriaService);
  const ledgerService = new LedgerService(ledgerRepository);
  const verdictService = new VerdictService(verdictRepository, jobService, ledgerService);
  const feedbackService = new FeedbackService(feedbackRepository);
  const artifactService = new ArtifactService(artifactRepository, jobService, ledgerService);
  const providerCapabilityRegistry = new ProviderCapabilityRegistry([
    internalReviewerCapability,
    publicProviderCapability
  ]);
  const humanReviewTaskService = new HumanReviewTaskService(
    reviewTaskRepository,
    jobService,
    ledgerService,
    providerCapabilityRegistry
  );
  const responseValidationService = new ResponseValidationService(
    responseRepository,
    reviewTaskRepository,
    jobService,
    ledgerService
  );
  const consensusService = new ConsensusService(
    consensusRepository,
    responseRepository,
    reviewTaskRepository,
    jobService,
    ledgerService
  );
  const adjudicationService = new AdjudicationService(
    adjudicationRepository,
    consensusRepository,
    jobService,
    ledgerService,
    verdictService,
    feedbackService
  );
  const privacyGate = new PrivacyGate(
    privacyRepository,
    jobService,
    ledgerService,
    verdictService,
    feedbackService
  );
  const selfVerificationService = new SelfVerificationService(
    selfVerificationRepository,
    jobService,
    ledgerService,
    verdictService,
    feedbackService
  );

  app.decorate("services", {
    adjudicationService,
    artifactService,
    consensusService,
    feedbackRepository,
    humanReviewTaskService,
    jobService,
    privacyGate,
    responseValidationService,
    selfVerificationService,
    verdictRepository
  });

  app.get("/health", () => ({
    status: "ok"
  }));

  void registerVerificationJobRoutes(app);
  void registerEvidenceRoutes(app);
  void registerHumanReviewRoutes(app);
  void registerVerdictFeedbackRoutes(app);

  return app;
}
