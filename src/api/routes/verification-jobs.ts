import type { FastifyInstance } from "fastify";

import type { BudgetPolicy } from "../../domain/jobs/budget-policy.js";
import type {
  CriterionCriticality,
  JobSource
} from "../../domain/jobs/models.js";

type CreateJobBody = {
  acceptance_criteria: Array<{
    criterion_id: string;
    criticality: CriterionCriticality;
    evidence_requirements: string[];
    human_visible_text: string;
    pass_threshold?: number;
  }>;
  agent_run_id?: string;
  budget_policy: BudgetPolicy;
  deadline_at: string;
  idempotency_key: string;
  parent_job_id?: string;
  risk_tier: "low" | "medium" | "high" | "regulated" | "release_gating";
  source: {
    repository: string;
    branch?: string;
    commit: string;
    build_id?: string;
    environment: string;
    route: string;
    tenant?: string;
    feature_flags?: string[];
    viewport?: string;
    locale?: string;
    timezone?: string;
  };
};

function toJobSource(source: CreateJobBody["source"]): JobSource {
  return {
    repository: source.repository,
    branch: source.branch,
    commit: source.commit,
    buildId: source.build_id,
    environment: source.environment,
    route: source.route,
    tenant: source.tenant,
    featureFlags: source.feature_flags ?? [],
    viewport: source.viewport,
    locale: source.locale,
    timezone: source.timezone
  };
}

function serializeJob(
  job: Awaited<
    ReturnType<FastifyInstance["services"]["jobService"]["get"]>
  > extends infer T
    ? Exclude<T, null>
    : never
) {
  return {
    job_id: job.jobId,
    idempotency_key: job.idempotencyKey,
    agent_run_id: job.agentRunId,
    parent_job_id: job.parentJobId,
    source: {
      repository: job.source.repository,
      branch: job.source.branch,
      commit: job.source.commit,
      build_id: job.source.buildId,
      environment: job.source.environment,
      route: job.source.route,
      tenant: job.source.tenant,
      feature_flags: job.source.featureFlags,
      viewport: job.source.viewport,
      locale: job.source.locale,
      timezone: job.source.timezone
    },
    risk_tier: job.riskTier,
    acceptance_criteria: job.acceptanceCriteria.map((criterion) => ({
      criterion_id: criterion.criterionId,
      human_visible_text: criterion.humanVisibleText,
      criticality: criterion.criticality,
      evidence_requirements: criterion.evidenceRequirements,
      pass_threshold: criterion.passThreshold
    })),
    deadline_at: job.deadlineAt.toISOString(),
    budget_policy: {
      max_job_cost: job.budgetPolicy.maxJobCost,
      max_assignments: job.budgetPolicy.maxAssignments,
      max_retries: job.budgetPolicy.maxRetries,
      max_run_cost: job.budgetPolicy.maxRunCost,
      max_project_daily_cost: job.budgetPolicy.maxProjectDailyCost,
      max_provider_daily_cost: job.budgetPolicy.maxProviderDailyCost
    },
    state: job.state,
    artifact_manifest_id: job.artifactManifestId,
    created_at: job.createdAt.toISOString(),
    updated_at: job.updatedAt.toISOString()
  };
}

export function registerVerificationJobRoutes(app: FastifyInstance) {
  app.post<{ Body: CreateJobBody }>(
    "/verification-jobs",
    async (request, reply) => {
      app.services.metrics.increment("broker.job.create");
      const body = request.body;

      try {
        const job = await app.services.jobService.createOrGet({
          acceptanceCriteria: body.acceptance_criteria.map((criterion) => ({
            criterionId: criterion.criterion_id,
            criticality: criterion.criticality,
            evidenceRequirements: criterion.evidence_requirements,
            humanVisibleText: criterion.human_visible_text,
            passThreshold: criterion.pass_threshold
          })),
          agentRunId: body.agent_run_id,
          budgetPolicy: body.budget_policy,
          deadlineAt: new Date(body.deadline_at),
          idempotencyKey: body.idempotency_key,
          parentJobId: body.parent_job_id,
          riskTier: body.risk_tier,
          source: toJobSource(body.source)
        });

        return reply.code(202).send(serializeJob(job));
      } catch (error) {
        return reply.code(400).send({
          message: error instanceof Error ? error.message : "Invalid request"
        });
      }
    }
  );

  app.get<{ Params: { jobId: string } }>(
    "/verification-jobs/:jobId",
    async (request, reply) => {
      const job = await app.services.jobService.get(request.params.jobId);
      if (!job) {
        return reply.code(404).send({ message: "Job not found" });
      }

      return serializeJob(job);
    }
  );
}
