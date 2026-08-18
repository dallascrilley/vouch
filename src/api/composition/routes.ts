import type { FastifyInstance } from "fastify";

import { registerEvidenceRoutes } from "../routes/evidence.js";
import { registerHumanReviewRoutes } from "../routes/human-review.js";
import { registerProviderCallbackRoutes } from "../routes/provider-callback.js";
import { registerReleaseArtifactRoutes } from "../routes/release-artifact.js";
import { registerRuntimeOperationsRoutes } from "../routes/runtime-operations.js";
import { registerStuckStateRoutes } from "../routes/stuck-state.js";
import { registerVerificationJobRoutes } from "../routes/verification-jobs.js";
import { registerVerdictFeedbackRoutes } from "../routes/verdict-feedback.js";

/**
 * Registers every route module. Order is preserved from the original inline
 * list; `/health` stays in `app.ts` because it reads the resolved config
 * directly rather than going through `app.services`.
 */
export function registerRoutes(app: FastifyInstance): void {
  void registerVerificationJobRoutes(app);
  void registerEvidenceRoutes(app);
  void registerHumanReviewRoutes(app);
  void registerVerdictFeedbackRoutes(app);
  void registerRuntimeOperationsRoutes(app);
  void registerProviderCallbackRoutes(app);
  void registerStuckStateRoutes(app);
  void registerReleaseArtifactRoutes(app);
}
