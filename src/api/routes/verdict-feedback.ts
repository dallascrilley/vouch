import type { FastifyInstance } from "fastify";

export function registerVerdictFeedbackRoutes(app: FastifyInstance) {
  app.get<{ Params: { jobId: string } }>("/verification-jobs/:jobId/verdict", async (request, reply) => {
    const verdict = await app.services.verdictRepository.findByJobId(request.params.jobId);
    if (!verdict) {
      return reply.code(404).send({ message: "Verdict not available" });
    }

    return {
      verdict_id: verdict.verdictId,
      job_id: verdict.jobId,
      final_verdict: verdict.finalVerdict,
      confidence: verdict.confidence,
      max_severity: verdict.maxSeverity,
      evidence_refs: verdict.evidenceRefs,
      human_consensus_summary: verdict.humanConsensusSummary ?? null,
      adjudication_summary: verdict.adjudicationSummary ?? null,
      cost: verdict.cost ?? null,
      latency_seconds: verdict.latencySeconds ?? null,
      retry_recommendation: verdict.retryRecommendation ?? null,
      release_gate_effect: verdict.releaseGateEffect
    };
  });

  app.get<{ Params: { jobId: string } }>("/verification-jobs/:jobId/feedback", async (request, reply) => {
    const signal = await app.services.feedbackRepository.findByJobId(request.params.jobId);
    if (!signal) {
      return reply.code(404).send({ message: "Feedback not available" });
    }

    return {
      feedback_id: signal.feedbackId,
      job_id: signal.jobId,
      final_verdict: signal.finalVerdict,
      failed_criteria: signal.failedCriteria,
      severity: signal.severity ?? null,
      defect_category: signal.defectCategory ?? null,
      evidence_pointers: signal.evidencePointers,
      human_annotations: signal.humanAnnotations,
      machine_check_failures: signal.machineCheckFailures,
      retry_allowed: signal.retryAllowed,
      retry_reason: signal.retryReason ?? null,
      repair_hint: signal.repairHint ?? null,
      budget_state: signal.budgetState ?? null,
      policy_constraints: signal.policyConstraints
    };
  });
}
