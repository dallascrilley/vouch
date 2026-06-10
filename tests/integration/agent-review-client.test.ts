import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { requestHumanReview } from "../../scripts/lib/agent-review-client.js";
import { parseTaskTemplate } from "../../scripts/lib/review-templates.js";
import { buildApp } from "../../src/api/app.js";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

describe("agent review client one-call flow", () => {
  let app: ReturnType<typeof buildApp>;
  let tempDir: string;
  let dispatchedBody: Record<string, unknown> | undefined;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "agent-review-client-"));
    writeFileSync(join(tempDir, "shot.png"), TINY_PNG);

    const sharedSecret = "top-secret";
    app = buildApp({
      env: {
        ...process.env,
        PROVIDER_ENABLED: "true",
        PROVIDER_ID: "real-provider",
        PROVIDER_DISPATCH_MODE: "api",
        PROVIDER_INGESTION_MODE: "callback",
        PROVIDER_API_KEY: "bridge-key",
        PROVIDER_CALLBACK_BASE_URL: "http://broker.test",
        PROVIDER_DISPATCH_URL: "http://bridge.test/dispatch",
        PROVIDER_SHARED_SECRET: sharedSecret
      },
      fetchImpl: (input, init) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        if (url !== "http://bridge.test/dispatch") {
          throw new Error(`Unexpected broker fetch URL: ${url}`);
        }
        dispatchedBody = JSON.parse(init?.body as string) as Record<
          string,
          unknown
        >;

        // Simulate a worker submitting after the HIT exists: deliver a
        // unanimous high-confidence pass once the dispatching request settles.
        setTimeout(() => {
          void app.inject({
            method: "POST",
            url: "/provider-callback",
            payload: {
              criterion_results: [
                {
                  confidence: "high",
                  criterion_id: "hero-cta-no-overlap",
                  status: "pass"
                }
              ],
              defect_category: "binary_screenshot_check",
              delivery_mode: "polling",
              evidence_note: "The CTA sits clearly below the headline.",
              overall_verdict: "pass",
              provider_id: "real-provider",
              provider_response_id: "assignment-1",
              provider_task_id: "hit-test-1",
              reviewer_pseudonymous_id: "worker-1",
              severity: "S4",
              shared_secret: sharedSecret
            }
          });
        }, 200);

        return Promise.resolve(
          new Response(
            JSON.stringify({
              provider_assignment_scope: "managed",
              provider_task_id: "hit-test-1"
            }),
            { headers: { "content-type": "application/json" }, status: 202 }
          )
        );
      }
    });
    await app.ready();
    await app.listen({ host: "127.0.0.1", port: 0 });
  });

  afterEach(async () => {
    await app.close();
    rmSync(tempDir, { force: true, recursive: true });
  });

  it("commissions a structured review and blocks until pass feedback", async () => {
    const address = app.server.address() as AddressInfo;
    const result = await requestHumanReview({
      brokerBaseUrl: `http://127.0.0.1:${address.port}`,
      criteria: [
        {
          criterionId: "hero-cta-no-overlap",
          criticality: "major",
          humanVisibleText: "The orange CTA does not overlap the hero headline."
        }
      ],
      pollIntervalMs: 100,
      riskTier: "low",
      screenshot: {
        caption: "Hero at 1440x900",
        path: join(tempDir, "shot.png")
      },
      template: {
        instructions: "Look at the screenshot and answer the question.",
        params: {
          criteria: [
            {
              id: "hero-cta-no-overlap",
              statement: "The orange CTA does not overlap the hero headline."
            }
          ]
        },
        template_id: "binary_screenshot_check",
        v: 1
      },
      timeoutMs: 15_000
    });

    expect(result.providerTaskId).toBe("hit-test-1");
    expect(result.estimatedCostUsd).toBe(0.12);
    expect(result.timedOut).toBe(false);
    expect(result.feedback).toMatchObject({
      agent_next_action: "pass",
      final_verdict: "pass"
    });

    // The dispatched task_template is a structured envelope with the low-risk
    // pricing preset applied.
    const parsed = parseTaskTemplate(dispatchedBody?.task_template as string);
    expect(parsed.kind).toBe("structured");
    if (parsed.kind === "structured") {
      expect(parsed.envelope.pricing).toEqual({
        max_assignments: 1,
        reward: "0.10"
      });
    }
    expect(dispatchedBody?.visual_evidence).toMatchObject({
      viewport: "unspecified"
    });
  });
});
