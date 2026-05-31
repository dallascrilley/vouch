import type { VerdictLedgerRepository } from "../../adapters/storage/repositories.js";
import type { VerdictLedgerEvent } from "../feedback/models.js";
import type { JobState } from "../shared/types.js";

const allowedTransitions: Record<JobState, JobState[]> = {
  created: ["artifacts_collected", "canceled"],
  artifacts_collected: ["privacy_classified", "artifact_recapture_requested", "canceled"],
  privacy_classified: ["self_verifying", "fail_closed", "internal_review_queued", "external_review_queued"],
  self_verifying: ["decision_point", "artifact_recapture_requested", "fail_closed"],
  decision_point: [
    "final_pass",
    "final_fail",
    "agent_retry_requested",
    "artifact_recapture_requested",
    "internal_review_queued",
    "external_review_queued",
    "adjudication_required",
    "fail_closed"
  ],
  external_review_queued: ["human_responses_received", "adjudication_required", "fail_closed", "canceled"],
  internal_review_queued: ["human_responses_received", "adjudication_required", "fail_closed", "canceled"],
  human_responses_received: ["consensus_running", "adjudication_required", "fail_closed"],
  consensus_running: ["final_pass", "final_fail", "artifact_recapture_requested", "adjudication_required", "fail_closed"],
  adjudication_required: ["final_pass", "final_fail", "agent_retry_requested", "artifact_recapture_requested", "fail_closed"],
  final_pass: [],
  final_fail: [],
  agent_retry_requested: [],
  artifact_recapture_requested: [],
  fail_closed: [],
  canceled: []
};

type StateTransitionInput = {
  artifactHashes?: string[];
  correlationId: string;
  jobId: string;
  payloadHash: string;
  policyVersion: string;
};

export class LedgerService {
  constructor(private readonly ledgerRepository: VerdictLedgerRepository) {}

  async append(event: VerdictLedgerEvent): Promise<void> {
    await this.ledgerRepository.append(event);
  }

  async recordStateTransition(
    from: JobState,
    to: JobState,
    input: StateTransitionInput
  ): Promise<VerdictLedgerEvent> {
    this.assertTransitionAllowed(from, to);

    const event: VerdictLedgerEvent = {
      eventId: `${input.jobId}:${from}->${to}:${input.correlationId}`,
      jobId: input.jobId,
      eventType: `job.state.${from}.to.${to}`,
      actorType: "system",
      occurredAt: new Date(),
      payloadHash: input.payloadHash,
      artifactHashes: input.artifactHashes ?? [],
      policyVersion: input.policyVersion,
      correlationId: input.correlationId
    };

    await this.append(event);
    return event;
  }

  async recordExternalizationDecision(
    input: StateTransitionInput & {
      decision: string;
      blockedRoutes?: string[];
      costDelta?: number;
    }
  ): Promise<VerdictLedgerEvent> {
    const event: VerdictLedgerEvent = {
      eventId: `${input.jobId}:externalization:${input.correlationId}`,
      jobId: input.jobId,
      eventType: `privacy.externalization.${input.decision}`,
      actorType: "system",
      occurredAt: new Date(),
      payloadHash: input.payloadHash,
      artifactHashes: input.artifactHashes ?? [],
      policyVersion: input.policyVersion,
      costDelta: input.costDelta,
      correlationId: input.correlationId
    };

    await this.append(event);
    return event;
  }

  private assertTransitionAllowed(from: JobState, to: JobState) {
    const allowed = allowedTransitions[from];

    if (!allowed.includes(to)) {
      throw new Error(`Invalid job state transition: ${from} -> ${to}`);
    }
  }
}
