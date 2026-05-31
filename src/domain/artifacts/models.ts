import type { Identifier } from "../shared/types.js";
import type { JobSource } from "../jobs/models.js";

export type ArtifactType =
  | "screenshot"
  | "before_after_screenshot"
  | "dom_snapshot"
  | "accessibility_tree"
  | "console_summary"
  | "network_summary"
  | "trace_summary"
  | "video"
  | "ocr_output"
  | "layout_map";

export type ArtifactQuality =
  | "sufficient"
  | "blank"
  | "loading"
  | "cropped"
  | "too_redacted"
  | "missing_required_evidence";

export type ArtifactRef = {
  artifactId: Identifier;
  artifactType: ArtifactType;
  contentHash: string;
  provenance: string;
  capturedAt: Date;
};

export type SanitizedPackageRef = {
  packageId: Identifier;
  packageHash: string;
  redactionPolicyVersion: string;
  transformHash: string;
  externalizationDecision: string;
};

export type ArtifactManifest = {
  manifestId: Identifier;
  jobId: Identifier;
  rawArtifacts: ArtifactRef[];
  sanitizedPackages: SanitizedPackageRef[];
  artifactQuality: ArtifactQuality;
  environment: JobSource;
  createdAt: Date;
};
