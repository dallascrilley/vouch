import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  assertProviderProofReplay,
  listProviderProofBundles,
  loadProviderProofBundle,
  replayProviderProofBundle
} from "../helpers/provider-proof-bundle.js";
import { buildProviderTestApp } from "../helpers/provider-test-app.js";

describe("provider proof-bundle replay", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = buildProviderTestApp();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("discovers the bundled return-path fixtures", () => {
    const bundles = listProviderProofBundles();
    expect(bundles).toContain("mturk-sandbox-pass-v1");
    expect(bundles).toContain("mturk-sandbox-fail-v1");
  });

  it("replays mturk-sandbox-pass-v1 offline through callback → auto-advance → pass", async () => {
    const bundle = loadProviderProofBundle("mturk-sandbox-pass-v1");
    const result = await replayProviderProofBundle(app, bundle);

    expect(() => assertProviderProofReplay(bundle, result)).not.toThrow();
    expect(result.callbackBody).toMatchObject({ auto_advanced: true });
    expect(result.feedbackBody).toMatchObject({
      final_verdict: "pass",
      retry_reason: null,
      policy_constraints: ["provider_auto_resolved"]
    });
    expect(result.verdictBody).toMatchObject({ final_verdict: "pass" });
  });

  it("replays mturk-sandbox-fail-v1 offline through callback → auto-advance → fail", async () => {
    const bundle = loadProviderProofBundle("mturk-sandbox-fail-v1");
    const result = await replayProviderProofBundle(app, bundle);

    expect(() => assertProviderProofReplay(bundle, result)).not.toThrow();
    expect(result.callbackBody).toMatchObject({ auto_advanced: true });
    expect(result.feedbackBody).toMatchObject({
      final_verdict: "fail",
      retry_allowed: true,
      retry_reason: "provider_unanimous_fail",
      policy_constraints: ["provider_auto_resolved"]
    });
    expect(result.verdictBody).toMatchObject({ final_verdict: "fail" });
  });

  it("replays with inspection ledger assertions when operator token is set", async () => {
    await app.close();
    app = buildProviderTestApp({ operatorToken: "proof-bundle-operator" });
    await app.ready();

    const bundle = loadProviderProofBundle("mturk-sandbox-pass-v1");
    const result = await replayProviderProofBundle(app, bundle, {
      operatorToken: "proof-bundle-operator"
    });

    expect(result.inspectionBody).not.toBeNull();
    expect(() => assertProviderProofReplay(bundle, result)).not.toThrow();
  });
});
