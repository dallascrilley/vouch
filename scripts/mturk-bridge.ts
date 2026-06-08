import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import Fastify from "fastify";

import {
  buildHtmlQuestion,
  loadBridgeState,
  normalizeAssignment,
  saveBridgeState,
  type BridgeDispatchBody
} from "./lib/mturk-bridge.js";

const execFileAsync = promisify(execFile);
const sandboxEndpoint = "https://mturk-requester-sandbox.us-east-1.amazonaws.com";

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const config = {
  awsEndpointUrl: process.env.MTURK_AWS_ENDPOINT_URL ?? sandboxEndpoint,
  awsRegion: process.env.MTURK_AWS_REGION ?? "us-east-1",
  autoApprovalDelaySeconds: Number(process.env.MTURK_AUTO_APPROVAL_DELAY_SECONDS ?? 259200),
  brokerCallbackUrl: process.env.MTURK_BROKER_CALLBACK_URL ?? "http://127.0.0.1:3000/provider-callback",
  bridgeApiKey: requireEnv("MTURK_BRIDGE_API_KEY"),
  expirationSeconds: Number(process.env.MTURK_EXPIRATION_SECONDS ?? 86400),
  maxAssignments: Number(process.env.MTURK_MAX_ASSIGNMENTS ?? 1),
  pollIntervalMs: Number(process.env.MTURK_POLL_INTERVAL_MS ?? 15000),
  port: Number(process.env.MTURK_BRIDGE_PORT ?? 3100),
  providerId: process.env.MTURK_PROVIDER_ID ?? "real-provider",
  reward: process.env.MTURK_REWARD ?? "0.05",
  sharedSecret: requireEnv("PROVIDER_SHARED_SECRET"),
  statePath: process.env.MTURK_BRIDGE_STATE_PATH ?? ".runtime/mturk-bridge-state.json",
  taskDurationSeconds: Number(process.env.MTURK_TASK_DURATION_SECONDS ?? 900),
  titlePrefix: process.env.MTURK_TITLE_PREFIX ?? "AI Broker UI Verification"
};

const app = Fastify({ logger: true });

app.get("/health", () => ({ ok: true, provider_id: config.providerId }));

app.post<{ Body: BridgeDispatchBody }>("/dispatch", async (request, reply) => {
  const authorization = request.headers.authorization;
  if (authorization !== `Bearer ${config.bridgeApiKey}`) {
    return reply.code(401).send({ message: "Invalid bridge authorization" });
  }

  const htmlQuestion = buildHtmlQuestion({
    criterionIds: request.body.criterion_ids,
    reviewTaskId: request.body.review_task_id,
    sandbox: config.awsEndpointUrl === sandboxEndpoint,
    taskTemplate: request.body.task_template
  });

  const tempDir = mkdtempSync(join(tmpdir(), "mturk-bridge-"));
  const questionPath = join(tempDir, "question.xml");
  writeFileSync(questionPath, htmlQuestion);

  try {
    const args = [
      "mturk",
      "create-hit",
      "--endpoint-url",
      config.awsEndpointUrl,
      "--region",
      config.awsRegion,
      "--title",
      `${config.titlePrefix}: ${request.body.review_task_id}`,
      "--description",
      `Observable UI verification for ${request.body.review_task_id}`,
      "--reward",
      config.reward,
      "--max-assignments",
      String(config.maxAssignments),
      "--assignment-duration-in-seconds",
      String(config.taskDurationSeconds),
      "--lifetime-in-seconds",
      String(config.expirationSeconds),
      "--auto-approval-delay-in-seconds",
      String(config.autoApprovalDelaySeconds),
      "--question",
      `file://${questionPath}`,
      "--requester-annotation",
      JSON.stringify({
        review_task_id: request.body.review_task_id,
        reviewer_pool: request.body.reviewer_pool
      }),
      "--output",
      "json"
    ];
    const { stdout } = await execFileAsync("aws", args, {
      env: process.env
    });
    const payload = JSON.parse(stdout) as { HIT?: { HITId?: string } };
    const hitId = payload.HIT?.HITId;
    if (!hitId) {
      throw new Error("MTurk create-hit did not return a HIT ID");
    }

    const state = loadBridgeState(config.statePath);
    state.tasks[hitId] = {
      createdAt: new Date().toISOString(),
      criterionIds: request.body.criterion_ids,
      deliveredAssignmentIds: [],
      hitId,
      reviewTaskId: request.body.review_task_id,
      reviewerPool: request.body.reviewer_pool,
      sanitizedPackageId: request.body.sanitized_package_id,
      taskTemplate: request.body.task_template
    };
    saveBridgeState(config.statePath, state);

    return reply.code(202).send({
      provider_assignment_scope: request.body.reviewer_pool,
      provider_task_id: hitId
    });
  } finally {
    rmSync(tempDir, { force: true, recursive: true });
  }
});

async function pollAssignments() {
  const state = loadBridgeState(config.statePath);
  const hitIds = Object.keys(state.tasks);

  for (const hitId of hitIds) {
    const task = state.tasks[hitId];
    const { stdout } = await execFileAsync(
      "aws",
      [
        "mturk",
        "list-assignments-for-hit",
        "--endpoint-url",
        config.awsEndpointUrl,
        "--region",
        config.awsRegion,
        "--hit-id",
        hitId,
        "--assignment-statuses",
        "Submitted",
        "Approved",
        "Rejected",
        "--output",
        "json"
      ],
      { env: process.env }
    );

    const payload = JSON.parse(stdout) as {
      Assignments?: Array<{ Answer?: string; AssignmentId: string; WorkerId: string }>;
    };
    const assignments = payload.Assignments ?? [];

    for (const assignment of assignments) {
      if (task.deliveredAssignmentIds.includes(assignment.AssignmentId) || !assignment.Answer) {
        continue;
      }

      const callbackPayload = normalizeAssignment({
        answerXml: assignment.Answer,
        assignmentId: assignment.AssignmentId,
        criterionIds: task.criterionIds,
        providerId: config.providerId,
        providerTaskId: hitId,
        workerId: assignment.WorkerId
      });

      const response = await fetch(config.brokerCallbackUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...callbackPayload,
          shared_secret: config.sharedSecret
        })
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(`Broker callback failed for ${assignment.AssignmentId}: ${response.status} ${message}`);
      }

      task.deliveredAssignmentIds.push(assignment.AssignmentId);
      saveBridgeState(config.statePath, state);
    }
  }
}

async function main() {
  await app.listen({ host: "0.0.0.0", port: config.port });
  app.log.info({ port: config.port }, "mturk bridge listening");

  setInterval(() => {
    void pollAssignments().catch((error) => {
      app.log.error({ err: error }, "mturk bridge polling failed");
    });
  }, config.pollIntervalMs);
}

void main();
