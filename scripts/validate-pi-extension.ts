import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  BrokerSupervisor,
  type BrokerConnection
} from "../extensions/pi/src/broker-supervisor.js";
import {
  PiReviewClient,
  ReviewHandleRegistry
} from "../extensions/pi/src/review-client.js";
import type { StructuredTaskTemplate } from "./lib/review-templates.js";

function availablePort(): Promise<number> {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.once("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        rejectPort(new Error("Could not obtain a free validation port"));
        return;
      }
      server.close((error) => {
        if (error) rejectPort(error);
        else resolvePort(address.port);
      });
    });
  });
}

async function main() {
  const startedAt = Date.now();
  const runtimeRoot = mkdtempSync(join(tmpdir(), "vouch-pi-extension-"));
  let supervisor: BrokerSupervisor | undefined;
  try {
    execFileSync("npm", ["run", "build:js"], {
      cwd: process.cwd(),
      stdio: "ignore"
    });
    // Exercise Pi's actual extension loader and manifest before the lower-level
    // broker harness. The interactive UI is intentionally not started in CI.
    execFileSync(
      "node_modules/.bin/pi",
      ["--offline", "-e", "./extensions/pi", "--help"],
      {
        cwd: process.cwd(),
        stdio: "ignore"
      }
    );
    const port = await availablePort();
    supervisor = new BrokerSupervisor({
      dataDir: runtimeRoot,
      port,
      repoRoot: process.cwd()
    });
    const broker: BrokerConnection = await supervisor.ensureRunning();
    const client = new PiReviewClient({
      registry: new ReviewHandleRegistry(join(runtimeRoot, "handles.json"))
    });
    const template: StructuredTaskTemplate = {
      instructions: "Check the supplied text against the criterion.",
      params: {
        content: "Vouch demo review",
        criteria: [
          {
            id: "demo-text",
            statement: "The demo text is present."
          }
        ]
      },
      template_id: "text_quality_rubric",
      v: 1
    };
    const envelope = await client.review({
      brokerBaseUrl: broker.baseUrl,
      contentHash: "pi-extension-harness-content",
      criteria: [
        {
          criterionId: "demo-text",
          humanVisibleText: "The demo text is present."
        }
      ],
      dataClass: "internal_low",
      operatorToken: broker.operatorToken,
      reviewerPool: "managed",
      riskTier: "low",
      simulated: true,
      template,
      templateId: "text_quality_rubric",
      timeoutMs: 10_000
    });
    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs >= 60_000) {
      throw new Error(
        `Pi extension harness exceeded 60 seconds (${elapsedMs}ms)`
      );
    }
    if (envelope.status !== "settled" || envelope.simulated !== true) {
      throw new Error(
        `Pi extension harness did not settle a simulated verdict: ${JSON.stringify(envelope)}`
      );
    }
    console.log(
      JSON.stringify({
        elapsed_ms: elapsedMs,
        simulated: envelope.simulated,
        status: "pi extension validation passed"
      })
    );
  } finally {
    supervisor?.stop();
    rmSync(runtimeRoot, { force: true, recursive: true });
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
