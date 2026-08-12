/**
 * Replay provider return-path proof bundles offline (no crowd provider, AWS, or bridge).
 * Usage: npm run validate:provider-proof-bundle            # replays every bundle
 *        npm run validate:provider-proof-bundle -- <id>    # replays one bundle
 */
import { buildApp } from "../src/api/app.js";
import {
  assertProviderProofReplay,
  listProviderProofBundles,
  loadProviderProofBundle,
  replayProviderProofBundle
} from "../tests/helpers/provider-proof-bundle.js";

async function main() {
  const requestedBundleId = process.argv[2]?.trim();
  const available = listProviderProofBundles();

  if (requestedBundleId && !available.includes(requestedBundleId)) {
    throw new Error(`Unknown bundle ${requestedBundleId}. Available: ${available.join(", ")}`);
  }

  const bundleIds = requestedBundleId ? [requestedBundleId] : available;
  const app = buildApp({
    env: {
      ...process.env,
      PROVIDER_ENABLED: "true",
      PROVIDER_ID: "real-provider",
      PROVIDER_DISPATCH_MODE: "mock",
      PROVIDER_INGESTION_MODE: "callback",
      PROVIDER_API_KEY: "local-test-key",
      PROVIDER_CALLBACK_BASE_URL: "http://localhost:3000",
      PROVIDER_SHARED_SECRET: "top-secret",
      RUNTIME_OPERATOR_TOKEN: "proof-bundle-operator",
      RUNTIME_SQLITE_PATH: ":memory:",
      VITEST: "true"
    }
  });

  await app.ready();

  try {
    for (const bundleId of bundleIds) {
      const bundle = loadProviderProofBundle(bundleId);
      const result = await replayProviderProofBundle(app, bundle, {
        operatorToken: "proof-bundle-operator",
        sharedSecret: "top-secret"
      });
      assertProviderProofReplay(bundle, result);

      console.log(
        JSON.stringify(
          {
            auto_advanced: result.callbackBody.auto_advanced,
            bundle_id: bundleId,
            final_verdict: result.feedbackBody.final_verdict,
            job_id: result.jobId,
            ledger_events: (result.inspectionBody?.ledger as unknown[])?.length ?? 0,
            provider_task_id: result.providerTaskId,
            reference_correlation_ids: bundle.manifest.reference_correlation_ids,
            status: "provider proof-bundle replay passed"
          },
          null,
          2
        )
      );
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
