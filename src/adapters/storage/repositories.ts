import type { ArtifactManifest } from "../../domain/artifacts/models.js";
import type { AdjudicationCase, ConsensusResult } from "../../domain/consensus/models.js";
import type { AgentFeedbackSignal, FinalVerdict, VerdictLedgerEvent } from "../../domain/feedback/models.js";
import type {
  HumanResponse,
  HumanReviewTask,
  ProviderAdapterConfig,
  ProviderCapabilityProfile,
  ProviderResponseReceipt,
  ProviderTaskMapping,
  ReviewerPool
} from "../../domain/human-review/models.js";
import type { AcceptanceCriterion, VerificationJob } from "../../domain/jobs/models.js";
import type { PrivacyClassification } from "../../domain/privacy/models.js";
import type { SelfVerificationResult } from "../../domain/self-verification/models.js";

export interface VerificationJobRepository {
  findById(jobId: string): Promise<VerificationJob | null>;
  findByIdempotencyKey(idempotencyKey: string): Promise<VerificationJob | null>;
  save(job: VerificationJob): Promise<void>;
}

export interface AcceptanceCriterionRepository {
  findByJobId(jobId: string): Promise<AcceptanceCriterion[]>;
  saveAll(criteria: AcceptanceCriterion[]): Promise<void>;
}

export interface ArtifactManifestRepository {
  findById(manifestId: string): Promise<ArtifactManifest | null>;
  save(manifest: ArtifactManifest): Promise<void>;
}

export interface PrivacyClassificationRepository {
  findByJobId(jobId: string): Promise<PrivacyClassification | null>;
  save(classification: PrivacyClassification): Promise<void>;
}

export interface SelfVerificationResultRepository {
  findByJobId(jobId: string): Promise<SelfVerificationResult | null>;
  save(result: SelfVerificationResult): Promise<void>;
}

export interface HumanReviewTaskRepository {
  findById(reviewTaskId: string): Promise<HumanReviewTask | null>;
  findByJobId(jobId: string): Promise<HumanReviewTask[]>;
  save(task: HumanReviewTask): Promise<void>;
}

export interface HumanResponseRepository {
  findByReviewTaskId(reviewTaskId: string): Promise<HumanResponse[]>;
  save(response: HumanResponse): Promise<void>;
}

export interface ProviderConfigRepository {
  get(providerId: string): Promise<ProviderAdapterConfig | null>;
  save(config: ProviderAdapterConfig): Promise<void>;
}

export interface ProviderTaskMappingRepository {
  findByProviderTaskId(providerTaskId: string): Promise<ProviderTaskMapping | null>;
  findByReviewTaskId(reviewTaskId: string): Promise<ProviderTaskMapping | null>;
  save(mapping: ProviderTaskMapping): Promise<void>;
}

export interface ProviderResponseReceiptRepository {
  findByDedupeKey(dedupeKey: string): Promise<ProviderResponseReceipt | null>;
  save(receipt: ProviderResponseReceipt): Promise<void>;
}

export interface ConsensusResultRepository {
  findByJobId(jobId: string): Promise<ConsensusResult | null>;
  markAdjudicated(jobId: string): Promise<void>;
  save(result: ConsensusResult): Promise<void>;
}

export interface AdjudicationCaseRepository {
  findByJobId(jobId: string): Promise<AdjudicationCase | null>;
  save(caseFile: AdjudicationCase): Promise<void>;
}

export interface FinalVerdictRepository {
  findByJobId(jobId: string): Promise<FinalVerdict | null>;
  save(verdict: FinalVerdict): Promise<void>;
}

export interface AgentFeedbackRepository {
  findByJobId(jobId: string): Promise<AgentFeedbackSignal | null>;
  save(signal: AgentFeedbackSignal): Promise<void>;
}

export interface VerdictLedgerRepository {
  append(event: VerdictLedgerEvent): Promise<void>;
  listByJobId(jobId: string): Promise<VerdictLedgerEvent[]>;
}

export interface ReviewerPoolRepository {
  list(): Promise<ReviewerPool[]>;
}

export interface ProviderCapabilityRepository {
  list(): Promise<ProviderCapabilityProfile[]>;
}
