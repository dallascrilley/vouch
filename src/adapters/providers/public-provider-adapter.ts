import type { ProviderCapabilityProfile } from "../../domain/human-review/models.js";

export const publicProviderCapability: ProviderCapabilityProfile = {
  providerId: "public-crowd",
  supportedPoolTypes: ["public_crowd", "qualified_crowd"],
  supportsExternalTaskUrl: true,
  supportsStructuredForms: true,
  supportsWebhooks: true,
  supportsBulkApproval: true,
  supportsQualifications: true,
  supportsWorkerGroups: false,
  privacyLimitations: ["public-only"],
  costModel: "per-assignment",
  latencyProfile: "queue-based",
  rateOrLoadConstraints: []
};
