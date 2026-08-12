import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type BridgeDispatchBody = {
  callback_url?: string;
  criterion_ids: string[];
  review_task_id: string;
  reviewer_pool: string;
  sanitized_package_id: string;
  task_template: string;
  visual_evidence?: BridgeVisualEvidence;
};

export type BridgeVisualEvidence = {
  artifact_id: string;
  caption: string;
  content_hash: string;
  data_url: string;
  viewport: string;
};

export type BridgeTaskRecord = {
  approvedAssignmentIds?: string[];
  callbackAttempts?: Record<string, number>;
  createdAt: string;
  deadLetterAssignments?: BridgeDeadLetterAssignment[];
  criterionIds: string[];
  deliveredAssignmentIds: string[];
  deliveryComplete?: boolean;
  deliveryCompletedAt?: string;
  expiredAt?: string;
  lastDeliveryLagMs?: number;
  nextPollAt?: string;
  pollBackoffMs?: number;
  throttleEvents?: BridgeThrottleEvent[];
  hitId: string;
  hitExpirationAt?: string;
  hitReviewStatus?: string;
  hitStatus?: string;
  lastApprovalAt?: string;
  lastApprovalError?: BridgeTaskError;
  lastDeliveryAt?: string;
  lastError?: BridgeTaskError;
  lastHitStatusAt?: string;
  lastHitStatusError?: BridgeTaskError;
  lastPollAt?: string;
  maxAssignments?: number;
  qualificationRequirements?: unknown[];
  reviewTaskId: string;
  reviewerPool: string;
  sanitizedPackageId: string;
  taskTemplate: string;
  visualEvidence?: BridgeVisualEvidence;
};

export type BridgeDeadLetterAssignment = {
  assignmentId: string;
  attempts: number;
  reason: string;
  recordedAt: string;
  workerId?: string;
};

export type BridgeTaskError = {
  assignmentId?: string;
  message: string;
  recordedAt: string;
};

export type BridgeThrottleEvent = {
  message: string;
  nextPollAt: string;
  recordedAt: string;
};

export type BridgeState = {
  tasks: Record<string, BridgeTaskRecord>;
};

export type BridgeStateSummary = {
  deadLetters: Array<
    BridgeDeadLetterAssignment & {
      hitId: string;
      reviewTaskId: string;
    }
  >;
  tasks: Array<{
    approvedAssignmentCount: number;
    callbackAttemptedAssignmentCount: number;
    callbackAttemptTotal: number;
    deadLetterCount: number;
    deliveredAssignmentCount: number;
    deliveryComplete: boolean;
    deliveryCompletedAt?: string;
    deliveryLagMs?: number;
    expiredAt?: string;
    hitId: string;
    hitExpirationAt?: string;
    hitReviewStatus?: string;
    hitStatus?: string;
    lastApprovalAt?: string;
    lastApprovalError?: BridgeTaskError;
    lastDeliveryAt?: string;
    lastError?: BridgeTaskError;
    lastHitStatusAt?: string;
    lastHitStatusError?: BridgeTaskError;
    lastPollAt?: string;
    nextPollAt?: string;
    qualificationRequirementCount: number;
    reviewTaskId: string;
    reviewerPool: string;
    throttleEvents: BridgeThrottleEvent[];
  }>;
  totals: {
    approvedAssignments: number;
    deadLetters: number;
    deliveredAssignments: number;
    deliveryCompleteTasks: number;
    expiredTasks: number;
    qualificationRestrictedTasks: number;
    tasks: number;
  };
};

export type ProviderBridgeCallbackPayload = {
  criterion_results: Array<{
    criterion_id: string;
    confidence: "low" | "medium" | "high";
    status: "pass" | "fail" | "unclear" | "not_visible";
  }>;
  defect_category: string;
  delivery_mode?: "callback" | "polling";
  evidence_note: string;
  overall_verdict: "pass" | "fail" | "unclear" | "artifact_insufficient";
  provider_assignment_ref?: string;
  provider_id: string;
  provider_response_id: string;
  provider_task_id: string;
  quality_flags?: string[];
  reviewer_pseudonymous_id: string;
  severity: "S0" | "S1" | "S2" | "S3" | "S4";
};

export type DeliverProviderCallbackResult =
  | {
      attempts: number;
      delivered: true;
    }
  | {
      attempts: number;
      deadLettered: boolean;
      delivered: false;
      reason: string;
    };

export const emptyBridgeState = (): BridgeState => ({ tasks: {} });

export function loadBridgeState(path: string): BridgeState {
  try {
    const parsed = JSON.parse(
      readFileSync(path, "utf8")
    ) as Partial<BridgeState>;
    return {
      tasks: parsed.tasks ?? {}
    };
  } catch {
    return emptyBridgeState();
  }
}

export function saveBridgeState(path: string, state: BridgeState) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2));
}

export function mergeSaveBridgeState(path: string, state: BridgeState) {
  const current = loadBridgeState(path);
  saveBridgeState(path, {
    tasks: {
      ...current.tasks,
      ...state.tasks
    }
  });
}

export function summarizeBridgeState(state: BridgeState): BridgeStateSummary {
  const tasks = Object.values(state.tasks).map((task) => ({
    approvedAssignmentCount: task.approvedAssignmentIds?.length ?? 0,
    callbackAttemptedAssignmentCount: Object.keys(task.callbackAttempts ?? {})
      .length,
    callbackAttemptTotal: Object.values(task.callbackAttempts ?? {}).reduce(
      (total, attempts) => total + attempts,
      0
    ),
    deadLetterCount: task.deadLetterAssignments?.length ?? 0,
    deliveredAssignmentCount: task.deliveredAssignmentIds.length,
    deliveryComplete: task.deliveryComplete ?? false,
    deliveryCompletedAt: task.deliveryCompletedAt,
    deliveryLagMs: task.lastDeliveryLagMs,
    expiredAt: task.expiredAt,
    hitId: task.hitId,
    hitExpirationAt: task.hitExpirationAt,
    hitReviewStatus: task.hitReviewStatus,
    hitStatus: task.hitStatus,
    lastApprovalAt: task.lastApprovalAt,
    lastApprovalError: task.lastApprovalError,
    lastDeliveryAt: task.lastDeliveryAt,
    lastError: task.lastError,
    lastHitStatusAt: task.lastHitStatusAt,
    lastHitStatusError: task.lastHitStatusError,
    lastPollAt: task.lastPollAt,
    nextPollAt: task.nextPollAt,
    qualificationRequirementCount: task.qualificationRequirements?.length ?? 0,
    reviewTaskId: task.reviewTaskId,
    reviewerPool: task.reviewerPool,
    throttleEvents: task.throttleEvents ?? []
  }));
  const deadLetters = Object.values(state.tasks).flatMap((task) =>
    (task.deadLetterAssignments ?? []).map((deadLetter) => ({
      ...deadLetter,
      hitId: task.hitId,
      reviewTaskId: task.reviewTaskId
    }))
  );

  return {
    deadLetters,
    tasks,
    totals: {
      approvedAssignments: tasks.reduce(
        (total, task) => total + task.approvedAssignmentCount,
        0
      ),
      deadLetters: deadLetters.length,
      deliveredAssignments: tasks.reduce(
        (total, task) => total + task.deliveredAssignmentCount,
        0
      ),
      deliveryCompleteTasks: tasks.filter((task) => task.deliveryComplete)
        .length,
      expiredTasks: tasks.filter((task) => task.expiredAt).length,
      qualificationRestrictedTasks: tasks.filter(
        (task) => task.qualificationRequirementCount > 0
      ).length,
      tasks: tasks.length
    }
  };
}

export async function deliverProviderCallback(input: {
  brokerCallbackUrl: string;
  expectedAssignmentCount?: number;
  fetchImpl?: typeof fetch;
  maxCallbackAttempts: number;
  now?: () => Date;
  payload: ProviderBridgeCallbackPayload;
  responseId: string;
  save: () => void;
  sharedSecret: string;
  submittedAt?: Date;
  task: BridgeTaskRecord;
  workerId?: string;
}): Promise<DeliverProviderCallbackResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const now = input.now ?? (() => new Date());
  const attempts = (input.task.callbackAttempts?.[input.responseId] ?? 0) + 1;
  input.task.callbackAttempts = {
    ...input.task.callbackAttempts,
    [input.responseId]: attempts
  };
  input.save();

  const response = await fetchImpl(input.brokerCallbackUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...input.payload,
      shared_secret: input.sharedSecret
    })
  });

  if (!response.ok) {
    const message = await response.text();
    const reason = `Broker callback failed: ${response.status} ${message}`;
    input.task.lastError = {
      assignmentId: input.responseId,
      message: reason,
      recordedAt: now().toISOString()
    };

    const deadLettered = attempts >= input.maxCallbackAttempts;
    if (deadLettered) {
      input.task.deadLetterAssignments ??= [];
      input.task.deadLetterAssignments.push({
        assignmentId: input.responseId,
        attempts,
        reason,
        recordedAt: now().toISOString(),
        workerId: input.workerId
      });
    }
    input.save();
    return { attempts, deadLettered, delivered: false, reason };
  }

  const deliveredAt = now();
  input.task.deliveredAssignmentIds.push(input.responseId);
  input.task.lastDeliveryAt = deliveredAt.toISOString();
  if (input.submittedAt && Number.isFinite(input.submittedAt.getTime())) {
    input.task.lastDeliveryLagMs = Math.max(
      0,
      deliveredAt.getTime() - input.submittedAt.getTime()
    );
  }
  if (
    input.expectedAssignmentCount &&
    input.task.deliveredAssignmentIds.length >= input.expectedAssignmentCount
  ) {
    input.task.deliveryComplete = true;
    input.task.deliveryCompletedAt = deliveredAt.toISOString();
  }
  delete input.task.lastError;
  input.save();

  return { attempts, delivered: true };
}

export function isThrottlingErrorMessage(message: string) {
  return /throttl|rate exceeded|toomanyrequests|slow ?down|requestlimitexceeded/i.test(
    message
  );
}

export function nextPollBackoffMs(input: {
  currentBackoffMs?: number;
  maxPollBackoffMs: number;
  pollIntervalMs: number;
}) {
  return Math.min(
    (input.currentBackoffMs ?? input.pollIntervalMs) * 2,
    input.maxPollBackoffMs
  );
}
