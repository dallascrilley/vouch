import type {
  AcceptanceCriterion,
  CriterionCriticality,
  CriterionStatus,
  JobSource,
  VerificationJob
} from "./models.js";
import type {
  AcceptanceCriterionRepository,
  VerificationJobRepository
} from "../../adapters/storage/repositories.js";
import type { AcceptanceCriteriaService } from "./acceptance-criteria-service.js";
import type { RiskTier } from "../shared/types.js";
import type { BudgetPolicy } from "./budget-policy.js";

type CreateJobInput = {
  acceptanceCriteria: Array<{
    criterionId: string;
    criticality: CriterionCriticality;
    evidenceRequirements: string[];
    humanVisibleText: string;
    passThreshold?: number;
  }>;
  agentRunId?: string;
  budgetPolicy: BudgetPolicy;
  deadlineAt: Date;
  idempotencyKey: string;
  parentJobId?: string;
  riskTier: RiskTier;
  source: JobSource;
};

export class JobService {
  constructor(
    private readonly jobRepository: VerificationJobRepository,
    private readonly criterionRepository: AcceptanceCriterionRepository,
    private readonly acceptanceCriteriaService: AcceptanceCriteriaService
  ) {}

  async createOrGet(input: CreateJobInput): Promise<VerificationJob> {
    const existingJob = await this.jobRepository.findByIdempotencyKey(input.idempotencyKey);
    if (existingJob) {
      return existingJob;
    }

    const jobId = `job_${crypto.randomUUID()}`;
    const criteria = this.createCriteria(jobId, input.acceptanceCriteria);
    this.acceptanceCriteriaService.validate(criteria);

    const job: VerificationJob = {
      jobId,
      idempotencyKey: input.idempotencyKey,
      agentRunId: input.agentRunId,
      parentJobId: input.parentJobId,
      source: input.source,
      riskTier: input.riskTier,
      state: "created",
      deadlineAt: input.deadlineAt,
      budgetPolicyId: `budget_${jobId}`,
      acceptanceCriteria: criteria,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await this.jobRepository.save(job);
    await this.criterionRepository.saveAll(criteria);
    return job;
  }

  async get(jobId: string): Promise<VerificationJob | null> {
    return this.jobRepository.findById(jobId);
  }

  async save(job: VerificationJob): Promise<void> {
    job.updatedAt = new Date();
    await this.jobRepository.save(job);
  }

  private createCriteria(
    jobId: string,
    criteria: CreateJobInput["acceptanceCriteria"]
  ): AcceptanceCriterion[] {
    return criteria.map((criterion) => ({
      criterionId: criterion.criterionId,
      jobId,
      humanVisibleText: criterion.humanVisibleText,
      criticality: criterion.criticality,
      evidenceRequirements: criterion.evidenceRequirements,
      passThreshold: criterion.passThreshold,
      status: "pending" satisfies CriterionStatus
    }));
  }
}
