#!/usr/bin/env node
/**
 * MCP server exposing broker API primitives (not workflows).
 * Usage: BROKER_URL=http://127.0.0.1:3000 npm run mcp:broker
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";

const baseUrl = (process.env.BROKER_URL ?? "http://127.0.0.1:3000").replace(
  /\/$/,
  ""
);
const operatorToken = process.env.RUNTIME_OPERATOR_TOKEN;

function headers(): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json" };
  if (operatorToken) {
    h["x-operator-token"] = operatorToken;
  }
  return h;
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) {
    return null;
  }
  return JSON.parse(text) as unknown;
}

async function brokerGet(path: string) {
  const res = await fetch(`${baseUrl}${path}`, { headers: headers() });
  return { status: res.status, body: await parseBody(res) };
}

async function brokerPost(path: string, payload: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    body: JSON.stringify(payload),
    headers: headers(),
    method: "POST"
  });
  return { status: res.status, body: await parseBody(res) };
}

function requireString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing or invalid string argument: ${key}`);
  }
  return value;
}

const TOOLS = [
  {
    name: "create_verification_job",
    description: "POST /verification-jobs — create or idempotently retrieve a job",
    inputSchema: {
      type: "object",
      properties: { payload: { type: "object" } },
      required: ["payload"]
    }
  },
  {
    name: "attach_artifacts",
    description: "POST /verification-jobs/:jobId/artifacts",
    inputSchema: {
      type: "object",
      properties: {
        job_id: { type: "string" },
        payload: { type: "object" }
      },
      required: ["job_id", "payload"]
    }
  },
  {
    name: "record_privacy_classification",
    description: "POST /verification-jobs/:jobId/privacy-classification",
    inputSchema: {
      type: "object",
      properties: {
        job_id: { type: "string" },
        payload: { type: "object" }
      },
      required: ["job_id", "payload"]
    }
  },
  {
    name: "create_human_review_task",
    description: "POST /verification-jobs/:jobId/human-review-tasks",
    inputSchema: {
      type: "object",
      properties: {
        job_id: { type: "string" },
        payload: { type: "object" }
      },
      required: ["job_id", "payload"]
    }
  },
  {
    name: "get_job",
    description: "GET /verification-jobs/:jobId",
    inputSchema: {
      type: "object",
      properties: { job_id: { type: "string" } },
      required: ["job_id"]
    }
  },
  {
    name: "get_feedback",
    description: "GET /verification-jobs/:jobId/feedback",
    inputSchema: {
      type: "object",
      properties: { job_id: { type: "string" } },
      required: ["job_id"]
    }
  },
  {
    name: "get_verdict",
    description: "GET /verification-jobs/:jobId/verdict",
    inputSchema: {
      type: "object",
      properties: { job_id: { type: "string" } },
      required: ["job_id"]
    }
  },
  {
    name: "get_stuck_state",
    description: "GET /verification-jobs/:jobId/stuck-state (operator token when configured)",
    inputSchema: {
      type: "object",
      properties: { job_id: { type: "string" } },
      required: ["job_id"]
    }
  },
  {
    name: "get_runtime_inspection",
    description: "GET /runtime/inspection (operator token when configured)",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "get_runtime_metrics",
    description: "GET /runtime/metrics (operator token when configured)",
    inputSchema: { type: "object", properties: {} }
  }
] as const;

const server = new Server(
  { name: "ai-human-review-broker", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema
  }))
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const args = request.params.arguments ?? {};
  let result: { status: number; body: unknown };

  switch (request.params.name) {
    case "create_verification_job":
      result = await brokerPost("/verification-jobs", args.payload);
      break;
    case "attach_artifacts": {
      const jobId = requireString(args, "job_id");
      result = await brokerPost(
        `/verification-jobs/${jobId}/artifacts`,
        args.payload
      );
      break;
    }
    case "record_privacy_classification": {
      const jobId = requireString(args, "job_id");
      result = await brokerPost(
        `/verification-jobs/${jobId}/privacy-classification`,
        args.payload
      );
      break;
    }
    case "create_human_review_task": {
      const jobId = requireString(args, "job_id");
      result = await brokerPost(
        `/verification-jobs/${jobId}/human-review-tasks`,
        args.payload
      );
      break;
    }
    case "get_job":
      result = await brokerGet(
        `/verification-jobs/${requireString(args, "job_id")}`
      );
      break;
    case "get_feedback":
      result = await brokerGet(
        `/verification-jobs/${requireString(args, "job_id")}/feedback`
      );
      break;
    case "get_verdict":
      result = await brokerGet(
        `/verification-jobs/${requireString(args, "job_id")}/verdict`
      );
      break;
    case "get_stuck_state":
      result = await brokerGet(
        `/verification-jobs/${requireString(args, "job_id")}/stuck-state`
      );
      break;
    case "get_runtime_inspection":
      result = await brokerGet("/runtime/inspection");
      break;
    case "get_runtime_metrics":
      result = await brokerGet("/runtime/metrics");
      break;
    default:
      throw new Error(`Unknown tool: ${request.params.name}`);
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2)
      }
    ]
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);
