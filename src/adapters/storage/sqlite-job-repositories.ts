import type {
  AcceptanceCriterionRepository,
  ArtifactManifestRepository,
  PrivacyClassificationRepository,
  SelfVerificationResultRepository,
  VerificationJobRepository
} from "./repositories.js";
import type { ArtifactManifest } from "../../domain/artifacts/models.js";
import type { AcceptanceCriterion, VerificationJob } from "../../domain/jobs/models.js";
import type { PrivacyClassification } from "../../domain/privacy/models.js";
import type { SelfVerificationResult } from "../../domain/self-verification/models.js";
import { deserializeJson, serializeJson } from "./sqlite-codecs.js";
import type { SQLiteRuntimeStore } from "./sqlite-runtime-store.js";

type Row = { payload_json: string };

export class SQLiteVerificationJobRepository implements VerificationJobRepository {
  constructor(private readonly store: SQLiteRuntimeStore) {}

  findById(jobId: string) {
    const row = this.store.db
      .prepare("SELECT payload_json FROM verification_jobs WHERE job_id = ?")
      .get(jobId) as Row | undefined;

    return Promise.resolve(row ? deserializeJson<VerificationJob>(row.payload_json) : null);
  }

  findByIdempotencyKey(idempotencyKey: string) {
    const row = this.store.db
      .prepare("SELECT payload_json FROM verification_jobs WHERE idempotency_key = ?")
      .get(idempotencyKey) as Row | undefined;

    return Promise.resolve(row ? deserializeJson<VerificationJob>(row.payload_json) : null);
  }

  save(job: VerificationJob) {
    this.store.db
      .prepare(
        `INSERT INTO verification_jobs (job_id, idempotency_key, payload_json, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(job_id) DO UPDATE SET
           idempotency_key = excluded.idempotency_key,
           payload_json = excluded.payload_json,
           updated_at = excluded.updated_at`
      )
      .run(job.jobId, job.idempotencyKey, serializeJson(job), job.updatedAt.toISOString());

    return Promise.resolve();
  }
}

export class SQLiteAcceptanceCriterionRepository implements AcceptanceCriterionRepository {
  constructor(private readonly store: SQLiteRuntimeStore) {}

  findByJobId(jobId: string) {
    const rows = this.store.db
      .prepare("SELECT payload_json FROM acceptance_criteria WHERE job_id = ? ORDER BY criterion_id")
      .all(jobId) as Row[];

    return Promise.resolve(rows.map((row) => deserializeJson<AcceptanceCriterion>(row.payload_json)));
  }

  saveAll(criteria: AcceptanceCriterion[]) {
    const insert = this.store.db.prepare(
      `INSERT INTO acceptance_criteria (criterion_id, job_id, payload_json)
       VALUES (?, ?, ?)
       ON CONFLICT(criterion_id) DO UPDATE SET
         job_id = excluded.job_id,
         payload_json = excluded.payload_json`
    );

    for (const criterion of criteria) {
      insert.run(criterion.criterionId, criterion.jobId, serializeJson(criterion));
    }

    return Promise.resolve();
  }
}

export class SQLiteArtifactManifestRepository implements ArtifactManifestRepository {
  constructor(private readonly store: SQLiteRuntimeStore) {}

  findById(manifestId: string) {
    const row = this.store.db
      .prepare("SELECT payload_json FROM artifact_manifests WHERE manifest_id = ?")
      .get(manifestId) as Row | undefined;

    return Promise.resolve(row ? deserializeJson<ArtifactManifest>(row.payload_json) : null);
  }

  save(manifest: ArtifactManifest) {
    this.store.db
      .prepare(
        `INSERT INTO artifact_manifests (manifest_id, job_id, payload_json)
         VALUES (?, ?, ?)
         ON CONFLICT(manifest_id) DO UPDATE SET
           job_id = excluded.job_id,
           payload_json = excluded.payload_json`
      )
      .run(manifest.manifestId, manifest.jobId, serializeJson(manifest));

    return Promise.resolve();
  }
}

export class SQLitePrivacyClassificationRepository implements PrivacyClassificationRepository {
  constructor(private readonly store: SQLiteRuntimeStore) {}

  findByJobId(jobId: string) {
    const row = this.store.db
      .prepare("SELECT payload_json FROM privacy_classifications WHERE job_id = ?")
      .get(jobId) as Row | undefined;

    return Promise.resolve(row ? deserializeJson<PrivacyClassification>(row.payload_json) : null);
  }

  save(classification: PrivacyClassification) {
    this.store.db
      .prepare(
        `INSERT INTO privacy_classifications (job_id, payload_json)
         VALUES (?, ?)
         ON CONFLICT(job_id) DO UPDATE SET
           payload_json = excluded.payload_json`
      )
      .run(classification.jobId, serializeJson(classification));

    return Promise.resolve();
  }
}

export class SQLiteSelfVerificationResultRepository implements SelfVerificationResultRepository {
  constructor(private readonly store: SQLiteRuntimeStore) {}

  findByJobId(jobId: string) {
    const row = this.store.db
      .prepare("SELECT payload_json FROM self_verification_results WHERE job_id = ?")
      .get(jobId) as Row | undefined;

    return Promise.resolve(row ? deserializeJson<SelfVerificationResult>(row.payload_json) : null);
  }

  save(result: SelfVerificationResult) {
    this.store.db
      .prepare(
        `INSERT INTO self_verification_results (job_id, payload_json)
         VALUES (?, ?)
         ON CONFLICT(job_id) DO UPDATE SET
           payload_json = excluded.payload_json`
      )
      .run(result.jobId, serializeJson(result));

    return Promise.resolve();
  }
}
