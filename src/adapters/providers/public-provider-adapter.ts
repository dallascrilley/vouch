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

export const realProviderCapability: ProviderCapabilityProfile = {
  providerId: "real-provider",
  supportedPoolTypes: ["managed", "domain_expert"],
  supportsExternalTaskUrl: true,
  supportsStructuredForms: true,
  supportsWebhooks: true,
  supportsBulkApproval: false,
  supportsQualifications: true,
  supportsWorkerGroups: true,
  privacyLimitations: ["managed-only"],
  costModel: "per-dispatch",
  latencyProfile: "provider-api",
  rateOrLoadConstraints: ["local-config-required"]
};
