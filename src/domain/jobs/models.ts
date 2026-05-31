import type { Identifier, JobState, RiskTier } from "../shared/types.js";

export type JobSource = {
  repository: string;
  branch?: string;
  commit: string;
  buildId?: string;
  environment: string;
  route: string;
  tenant?: string;
  featureFlags: string[];
  viewport?: string;
  locale?: string;
  timezone?: string;
};

export type CriterionCriticality = "critical" | "major" | "minor" | "audit";

export type CriterionStatus = "pending" | "pass" | "fail" | "unclear" | "not_visible";

export type AcceptanceCriterion = {
  criterionId: Identifier;
  jobId: Identifier;
  humanVisibleText: string;
  criticality: CriterionCriticality;
  evidenceRequirements: string[];
  passThreshold?: number;
  status: CriterionStatus;
};

export type VerificationJob = {
  jobId: Identifier;
  idempotencyKey: string;
  agentRunId?: Identifier;
  parentJobId?: Identifier;
  source: JobSource;
  riskTier: RiskTier;
  state: JobState;
  deadlineAt: Date;
  budgetPolicyId: Identifier;
  acceptanceCriteria: AcceptanceCriterion[];
  artifactManifestId?: Identifier;
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date;
};
