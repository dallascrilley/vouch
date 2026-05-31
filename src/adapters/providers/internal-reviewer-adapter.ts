import type { ProviderCapabilityProfile } from "../../domain/human-review/models.js";

export const internalReviewerCapability: ProviderCapabilityProfile = {
  providerId: "internal-reviewer",
  supportedPoolTypes: ["internal"],
  supportsExternalTaskUrl: false,
  supportsStructuredForms: true,
  supportsWebhooks: false,
  supportsBulkApproval: false,
  supportsQualifications: false,
  supportsWorkerGroups: false,
  privacyLimitations: [],
  costModel: "internal-capacity",
  latencyProfile: "manual",
  rateOrLoadConstraints: []
};
