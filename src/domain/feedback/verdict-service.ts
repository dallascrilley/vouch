import type { FinalVerdict, FinalVerdictState } from "./models.js";
import type { FinalVerdictRepository } from "../../adapters/storage/repositories.js";
import type { JobService } from "../jobs/job-service.js";
import type { CriterionResult } from "../self-verification/models.js";
import type { LedgerService } from "../ledger/ledger-service.js";

type FinalizeOptions = {
  criterionOutcomes?: CriterionResult[];
  machineCheckFailures?: string[];
  policyConstraints?: string[];
  retryRecommendation?: string;
};

export class VerdictService {
  constructor(
    private readonly verdictRepository: FinalVerdictRepository,
    private readonly jobService: JobService,
    private readonly ledgerService: LedgerService
  ) {}

  async finalize(
    job: Awaited<ReturnType<JobService["get"]>> extends infer T ? Exclude<T, null> : never,
    finalVerdict: FinalVerdictState,
    options: FinalizeOptions = {}
  ): Promise<FinalVerdict> {
    const nextState = this.toJobState(finalVerdict);

    await this.ledgerService.recordStateTransition(job.state, nextState, {
      correlationId: `${job.jobId}:${finalVerdict}`,
      jobId: job.jobId,
      payloadHash: `${job.jobId}:${finalVerdict}`,
      policyVersion: "v1"
    });

    job.state = nextState;
    if (nextState === "final_pass" || nextState === "final_fail" || nextState === "fail_closed") {
      job.closedAt = new Date();
    }
    await this.jobService.save(job);

    const verdict: FinalVerdict = {
      verdictId: `verdict_${job.jobId}`,
      jobId: job.jobId,
      finalVerdict,
      criterionOutcomes: options.criterionOutcomes ?? [],
      confidence: "high",
      maxSeverity: "none",
      evidenceRefs: job.artifactManifestId ? [job.artifactManifestId] : [],
      retryRecommendation: options.retryRecommendation,
      releaseGateEffect: finalVerdict === "pass" ? "allow" : "block",
      createdAt: new Date()
    };

    await this.verdictRepository.save(verdict);
    return verdict;
  }

  private toJobState(finalVerdict: FinalVerdictState) {
    switch (finalVerdict) {
      case "pass":
        return "final_pass" as const;
      case "fail":
        return "final_fail" as const;
      case "retry":
        return "agent_retry_requested" as const;
      case "recapture":
        return "artifact_recapture_requested" as const;
      case "fail_closed":
        return "fail_closed" as const;
      case "unclear":
        return "adjudication_required" as const;
    }
  }
}
