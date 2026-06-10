import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type BridgeTask = {
    deliveredAssignmentCount?: number;
    deliveredAssignmentIds?: string[];
    deliveryComplete?: boolean;
    deliveryCompletedAt?: string;
    deliveryLagMs?: number;
    hitId: string;
    hitStatus?: string;
    lastDeliveryAt?: string;
    lastPollAt?: string;
    nextPollAt?: string;
    reviewTaskId: string;
    throttleEvents?: Array<{ message?: string; nextPollAt?: string; recordedAt?: string }>;
  };

type BridgeStateResponse = {
  tasks: BridgeTask[] | Record<string, BridgeTask>;
  totals?: unknown;
};

type Assignment = {
  AssignmentId: string;
  AssignmentStatus: string;
  SubmitTime?: string;
  WorkerId: string;
};

type FeedbackResponse = {
  agent_next_action?: string;
  failed_criteria?: string[];
  final_verdict?: string;
  provider_response_ids?: string[];
  retry_allowed?: boolean;
};

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function main() {
  const brokerBaseUrl = process.env.BROKER_BASE_URL ?? "http://127.0.0.1:3000";
  const bridgeBaseUrl = process.env.MTURK_BRIDGE_BASE_URL ?? "http://127.0.0.1:3100";
  const hitId = requireEnv("PHASE6_HIT_ID");
  const jobId = requireEnv("PHASE6_JOB_ID");
  const reviewTaskId = requireEnv("PHASE6_REVIEW_TASK_ID");
  const expectedAction = process.env.EXPECTED_AGENT_NEXT_ACTION;
  const bridgeApiKey = requireEnv("MTURK_BRIDGE_API_KEY");
  const awsEndpointUrl = process.env.MTURK_AWS_ENDPOINT_URL;
  const awsRegion = process.env.MTURK_AWS_REGION ?? "us-east-1";

  const assignments = await listAssignments({ awsEndpointUrl, awsRegion, hitId });
  const bridgeState = await getJson<BridgeStateResponse>(`${bridgeBaseUrl}/state`, {
    authorization: `Bearer ${bridgeApiKey}`
  });
  const bridgeTasks = normalizeBridgeTasks(bridgeState.tasks);
  const bridgeTask = bridgeTasks.find((task) => task.hitId === hitId || task.reviewTaskId === reviewTaskId);
  const feedback = await getOptionalJson<FeedbackResponse>(`${brokerBaseUrl}/verification-jobs/${jobId}/feedback`);

  const bridgeHealthErrors = bridgeTask ? validateBridgeHealth(bridgeTask) : [];

  const result = {
    assignments,
    bridge_health: bridgeTask
      ? {
          delivery_complete: bridgeTask.deliveryComplete ?? false,
          delivery_completed_at: bridgeTask.deliveryCompletedAt ?? null,
          delivery_lag_ms: bridgeTask.deliveryLagMs ?? null,
          last_poll_at: bridgeTask.lastPollAt ?? null,
          next_poll_at: bridgeTask.nextPollAt ?? null,
          schema_errors: bridgeHealthErrors,
          throttle_events: bridgeTask.throttleEvents ?? []
        }
      : null,
    bridge_task: bridgeTask,
    feedback,
    hit_id: hitId,
    job_id: jobId,
    review_task_id: reviewTaskId,
    status: "pending_worker_submission"
  };

  if (bridgeHealthErrors.length > 0) {
    console.log(JSON.stringify({ ...result, status: "bridge_health_schema_violation" }, null, 2));
    process.exitCode = 6;
    return;
  }

  if (assignments.length === 0) {
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = 2;
    return;
  }

  if (!feedback?.agent_next_action) {
    console.log(JSON.stringify({ ...result, status: "pending_feedback" }, null, 2));
    process.exitCode = 4;
    return;
  }

  if (expectedAction && feedback.agent_next_action !== expectedAction) {
    console.log(JSON.stringify({ ...result, status: "unexpected_agent_next_action" }, null, 2));
    process.exitCode = 5;
    return;
  }

  const deliveredCount =
    bridgeTask?.deliveredAssignmentCount ?? bridgeTask?.deliveredAssignmentIds?.length ?? 0;
  if (!bridgeTask?.deliveryComplete && (!bridgeTask || deliveredCount < assignments.length)) {
    console.log(
      JSON.stringify(
        {
          ...result,
          bridge_delivery_note: "bridge_task_missing_or_stale_using_aws_and_feedback",
          status: "verified"
        },
        null,
        2
      )
    );
    return;
  }

  console.log(JSON.stringify({ ...result, status: "verified" }, null, 2));
}

// Asserts bridge-health schema fields when present.
// See docs/ops/bridge-health-contract.md.
function validateBridgeHealth(task: BridgeTask): string[] {
  const errors: string[] = [];

  if (task.deliveryComplete !== undefined && typeof task.deliveryComplete !== "boolean") {
    errors.push("deliveryComplete must be a boolean when present");
  }
  if (
    task.deliveryLagMs !== undefined &&
    (typeof task.deliveryLagMs !== "number" || task.deliveryLagMs < 0)
  ) {
    errors.push("deliveryLagMs must be a non-negative number when present");
  }
  if (task.throttleEvents !== undefined && !Array.isArray(task.throttleEvents)) {
    errors.push("throttleEvents must be an array when present");
  }
  for (const field of ["deliveryCompletedAt", "lastPollAt", "nextPollAt"] as const) {
    const value = task[field];
    if (value !== undefined && Number.isNaN(new Date(value).getTime())) {
      errors.push(`${field} must be an ISO timestamp when present`);
    }
  }
  if (task.deliveryComplete === true && (task.deliveredAssignmentIds?.length ?? task.deliveredAssignmentCount ?? 0) === 0) {
    errors.push("deliveryComplete is true but no assignments were delivered");
  }

  return errors;
}

function normalizeBridgeTasks(tasks: BridgeStateResponse["tasks"]): BridgeTask[] {
  if (Array.isArray(tasks)) {
    return tasks;
  }
  if (tasks && typeof tasks === "object") {
    return Object.values(tasks);
  }
  return [];
}

async function listAssignments(input: {
  awsEndpointUrl?: string;
  awsRegion: string;
  hitId: string;
}): Promise<Assignment[]> {
  const args = [
    "mturk",
    "list-assignments-for-hit",
    "--hit-id",
    input.hitId,
    "--assignment-statuses",
    "Submitted",
    "Approved",
    "Rejected",
    "--region",
    input.awsRegion,
    "--output",
    "json"
  ];
  if (input.awsEndpointUrl) {
    args.push("--endpoint-url", input.awsEndpointUrl);
  }

  const { stdout } = await execFileAsync("aws", args, { env: process.env });
  const payload = JSON.parse(stdout) as { Assignments?: Assignment[] };
  return payload.Assignments ?? [];
}

async function getJson<T>(url: string, headers?: Record<string, string>): Promise<T> {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`${url} failed: ${response.status} ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

async function getOptionalJson<T>(url: string): Promise<T | null> {
  const response = await fetch(url);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`${url} failed: ${response.status} ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

void main();
