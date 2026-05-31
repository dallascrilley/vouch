import type { ArtifactManifest } from "./models.js";
import type { ArtifactManifestRepository } from "../../adapters/storage/repositories.js";
import type { LedgerService } from "../ledger/ledger-service.js";
import type { JobService } from "../jobs/job-service.js";

export class ArtifactService {
  constructor(
    private readonly artifactRepository: ArtifactManifestRepository,
    private readonly jobService: JobService,
    private readonly ledgerService: LedgerService
  ) {}

  async attach(manifest: ArtifactManifest): Promise<void> {
    for (const artifact of manifest.rawArtifacts) {
      if (!artifact.contentHash || !artifact.provenance) {
        throw new Error("Artifacts require content hashes and provenance");
      }
    }

    const job = await this.jobService.get(manifest.jobId);
    if (!job) {
      throw new Error(`Verification job not found: ${manifest.jobId}`);
    }

    await this.ledgerService.recordStateTransition(job.state, "artifacts_collected", {
      artifactHashes: manifest.rawArtifacts.map((artifact) => artifact.contentHash),
      correlationId: manifest.manifestId,
      jobId: job.jobId,
      payloadHash: manifest.manifestId,
      policyVersion: "v1"
    });

    job.state = "artifacts_collected";
    job.artifactManifestId = manifest.manifestId;
    await this.jobService.save(job);
    await this.artifactRepository.save(manifest);
  }
}
