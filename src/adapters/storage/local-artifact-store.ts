import { mkdirSync, readdirSync, rmSync } from "node:fs";

export class LocalArtifactStore {
  constructor(private readonly artifactRoot: string) {}

  ensureReady() {
    mkdirSync(this.artifactRoot, { recursive: true });
  }

  inspect() {
    this.ensureReady();
    return {
      artifactCount: readdirSync(this.artifactRoot).length,
      artifactRoot: this.artifactRoot
    };
  }

  reset() {
    rmSync(this.artifactRoot, { force: true, recursive: true });
    this.ensureReady();
  }
}
