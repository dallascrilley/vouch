import type { ArtifactRef, SanitizedPackageRef } from "../../domain/artifacts/models.js";

export type ArtifactPayload = {
  contentType: string;
  data: Uint8Array;
};

export interface ArtifactStore {
  putArtifact(ref: ArtifactRef, payload: ArtifactPayload): Promise<void>;
  getArtifact(artifactId: string): Promise<ArtifactPayload | null>;
  putSanitizedPackage(ref: SanitizedPackageRef, payload: ArtifactPayload): Promise<void>;
  getSanitizedPackage(packageId: string): Promise<ArtifactPayload | null>;
}
