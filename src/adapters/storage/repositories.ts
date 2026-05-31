import type { ArtifactManifest } from "../../domain/artifacts/models.js";
import type { AdjudicationCase, ConsensusResult } from "../../domain/consensus/models.js";
import type { AgentFeedbackSignal, FinalVerdict, VerdictLedgerEvent } from "../../domain/feedback/models.js";
import type { HumanResponse, HumanReviewTask, ProviderCapabilityProfile, ReviewerPool } from "../../domain/human-review/models.js";
import type { AcceptanceCriterion, VerificationJob } from "../../domain/jobs/models.js";
import type { PrivacyClassification } from "../../domain/privacy/models.js";
import type { SelfVerificationResult } from "../../domain/self-verification/models.js";

export interface VerificationJobRepository {
  findById(jobId: string): Promise<VerificationJob | null>;
  findByIdempotencyKey(idempotencyKey: string): Promise<VerificationJob | null>;
  save(job: VerificationJob): Promise<void>;
}

export interface AcceptanceCriterionRepository {
  saveAll(criteria: AcceptanceCriterion[]): Promise<void>;
}

export interface ArtifactManifestRepository {
  findById(manifestId: string): Promise<ArtifactManifest | null>;
  save(manifest: ArtifactManifest): Promise<void>;
}

export interface PrivacyClassificationRepository {
  save(classification: PrivacyClassification): Promise<void>;
}

export interface SelfVerificationResultRepository {
  save(result: SelfVerificationResult): Promise<void>;
}

export interface HumanReviewTaskRepository {
  findById(reviewTaskId: string): Promise<HumanReviewTask | null>;
  save(task: HumanReviewTask): Promise<void>;
}

export interface HumanResponseRepository {
  findByReviewTaskId(reviewTaskId: string): Promise<HumanResponse[]>;
  save(response: HumanResponse): Promise<void>;
}

export interface ConsensusResultRepository {
  markAdjudicated(jobId: string): Promise<void>;
  save(result: ConsensusResult): Promise<void>;
}

export interface AdjudicationCaseRepository {
  save(caseFile: AdjudicationCase): Promise<void>;
}

export interface FinalVerdictRepository {
  save(verdict: FinalVerdict): Promise<void>;
}

export interface AgentFeedbackRepository {
  save(signal: AgentFeedbackSignal): Promise<void>;
}

export interface VerdictLedgerRepository {
  append(event: VerdictLedgerEvent): Promise<void>;
}

export interface ReviewerPoolRepository {
  list(): Promise<ReviewerPool[]>;
}

export interface ProviderCapabilityRepository {
  list(): Promise<ProviderCapabilityProfile[]>;
}
