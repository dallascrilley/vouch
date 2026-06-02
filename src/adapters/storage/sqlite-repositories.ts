import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type {
  AcceptanceCriterionRepository,
  AdjudicationCaseRepository,
  AgentFeedbackRepository,
  ArtifactManifestRepository,
  ConsensusResultRepository,
  FinalVerdictRepository,
  HumanResponseRepository,
  HumanReviewTaskRepository,
  PrivacyClassificationRepository,
  SelfVerificationResultRepository,
  VerificationJobRepository,
  VerdictLedgerRepository
} from "./repositories.js";
import type { ArtifactManifest } from "../../domain/artifacts/models.js";
import type { AdjudicationCase, ConsensusResult } from "../../domain/consensus/models.js";
import type { AgentFeedbackSignal, FinalVerdict, VerdictLedgerEvent } from "../../domain/feedback/models.js";
import type { HumanResponse, HumanReviewTask } from "../../domain/human-review/models.js";
import type { AcceptanceCriterion, VerificationJob } from "../../domain/jobs/models.js";
import type { PrivacyClassification } from "../../domain/privacy/models.js";
import type { SelfVerificationResult } from "../../domain/self-verification/models.js";
import { deserializeJson, serializeJson, toTimestamp } from "./sqlite-codecs.js";
import { applySqliteMigrations } from "./sqlite-migrations.js";
import type { TransactionManager } from "./transaction-manager.js";

export class SQLiteRuntimeStore implements TransactionManager {
  readonly db: DatabaseSync;
  private transactionDepth = 0;

  constructor(path: string) {
    if (path !== ":memory:") {
      mkdirSync(dirname(path), { recursive: true });
    }

    this.db = new DatabaseSync(path);
    applySqliteMigrations(this.db);
  }

  close() {
    this.db.close();
  }

  async inTransaction<T>(operation: () => Promise<T>): Promise<T> {
    if (this.transactionDepth > 0) {
      return operation();
    }

    this.db.exec("BEGIN IMMEDIATE");
    this.transactionDepth += 1;

    try {
      const result = await operation();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    } finally {
      this.transactionDepth -= 1;
    }
  }
}

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

export class SQLiteHumanReviewTaskRepository implements HumanReviewTaskRepository {
  constructor(private readonly store: SQLiteRuntimeStore) {}

  findById(reviewTaskId: string) {
    const row = this.store.db
      .prepare("SELECT payload_json FROM human_review_tasks WHERE review_task_id = ?")
      .get(reviewTaskId) as Row | undefined;

    return Promise.resolve(row ? deserializeJson<HumanReviewTask>(row.payload_json) : null);
  }

  findByJobId(jobId: string) {
    const rows = this.store.db
      .prepare("SELECT payload_json FROM human_review_tasks WHERE job_id = ? ORDER BY review_task_id")
      .all(jobId) as Row[];

    return Promise.resolve(rows.map((row) => deserializeJson<HumanReviewTask>(row.payload_json)));
  }

  save(task: HumanReviewTask) {
    this.store.db
      .prepare(
        `INSERT INTO human_review_tasks (review_task_id, job_id, payload_json)
         VALUES (?, ?, ?)
         ON CONFLICT(review_task_id) DO UPDATE SET
           job_id = excluded.job_id,
           payload_json = excluded.payload_json`
      )
      .run(task.reviewTaskId, task.jobId, serializeJson(task));

    return Promise.resolve();
  }
}

export class SQLiteHumanResponseRepository implements HumanResponseRepository {
  constructor(private readonly store: SQLiteRuntimeStore) {}

  findByReviewTaskId(reviewTaskId: string) {
    const rows = this.store.db
      .prepare("SELECT payload_json FROM human_responses WHERE review_task_id = ? ORDER BY response_id")
      .all(reviewTaskId) as Row[];

    return Promise.resolve(rows.map((row) => deserializeJson<HumanResponse>(row.payload_json)));
  }

  save(response: HumanResponse) {
    this.store.db
      .prepare(
        `INSERT INTO human_responses (response_id, review_task_id, payload_json)
         VALUES (?, ?, ?)
         ON CONFLICT(response_id) DO UPDATE SET
           review_task_id = excluded.review_task_id,
           payload_json = excluded.payload_json`
      )
      .run(response.responseId, response.reviewTaskId, serializeJson(response));

    return Promise.resolve();
  }
}

export class SQLiteConsensusResultRepository implements ConsensusResultRepository {
  constructor(private readonly store: SQLiteRuntimeStore) {}

  findByJobId(jobId: string) {
    const row = this.store.db
      .prepare("SELECT payload_json FROM consensus_results WHERE job_id = ?")
      .get(jobId) as Row | undefined;

    return Promise.resolve(row ? deserializeJson<ConsensusResult>(row.payload_json) : null);
  }

  markAdjudicated(jobId: string) {
    const current = this.store.db
      .prepare("SELECT payload_json FROM consensus_results WHERE job_id = ?")
      .get(jobId) as Row | undefined;

    if (!current) {
      return Promise.resolve();
    }

    const result = deserializeJson<ConsensusResult>(current.payload_json);
    result.adjudicationTrigger = result.adjudicationTrigger ?? "manual_adjudication";
    return this.save(result);
  }

  save(result: ConsensusResult) {
    this.store.db
      .prepare(
        `INSERT INTO consensus_results (job_id, payload_json)
         VALUES (?, ?)
         ON CONFLICT(job_id) DO UPDATE SET
           payload_json = excluded.payload_json`
      )
      .run(result.jobId, serializeJson(result));

    return Promise.resolve();
  }
}

export class SQLiteAdjudicationCaseRepository implements AdjudicationCaseRepository {
  constructor(private readonly store: SQLiteRuntimeStore) {}

  findByJobId(jobId: string) {
    const row = this.store.db
      .prepare("SELECT payload_json FROM adjudication_cases WHERE job_id = ?")
      .get(jobId) as Row | undefined;

    return Promise.resolve(row ? deserializeJson<AdjudicationCase>(row.payload_json) : null);
  }

  save(caseFile: AdjudicationCase) {
    this.store.db
      .prepare(
        `INSERT INTO adjudication_cases (job_id, payload_json)
         VALUES (?, ?)
         ON CONFLICT(job_id) DO UPDATE SET
           payload_json = excluded.payload_json`
      )
      .run(caseFile.jobId, serializeJson(caseFile));

    return Promise.resolve();
  }
}

export class SQLiteFinalVerdictRepository implements FinalVerdictRepository {
  constructor(private readonly store: SQLiteRuntimeStore) {}

  findByJobId(jobId: string) {
    const row = this.store.db
      .prepare("SELECT payload_json FROM final_verdicts WHERE job_id = ?")
      .get(jobId) as Row | undefined;

    return Promise.resolve(row ? deserializeJson<FinalVerdict>(row.payload_json) : null);
  }

  save(verdict: FinalVerdict) {
    this.store.db
      .prepare(
        `INSERT INTO final_verdicts (job_id, payload_json)
         VALUES (?, ?)
         ON CONFLICT(job_id) DO UPDATE SET
           payload_json = excluded.payload_json`
      )
      .run(verdict.jobId, serializeJson(verdict));

    return Promise.resolve();
  }
}

export class SQLiteAgentFeedbackRepository implements AgentFeedbackRepository {
  constructor(private readonly store: SQLiteRuntimeStore) {}

  findByJobId(jobId: string) {
    const row = this.store.db
      .prepare("SELECT payload_json FROM feedback_signals WHERE job_id = ?")
      .get(jobId) as Row | undefined;

    return Promise.resolve(row ? deserializeJson<AgentFeedbackSignal>(row.payload_json) : null);
  }

  save(signal: AgentFeedbackSignal) {
    this.store.db
      .prepare(
        `INSERT INTO feedback_signals (job_id, payload_json)
         VALUES (?, ?)
         ON CONFLICT(job_id) DO UPDATE SET
           payload_json = excluded.payload_json`
      )
      .run(signal.jobId, serializeJson(signal));

    return Promise.resolve();
  }
}

export class SQLiteVerdictLedgerRepository implements VerdictLedgerRepository {
  constructor(private readonly store: SQLiteRuntimeStore) {}

  append(event: VerdictLedgerEvent) {
    this.store.db
      .prepare(
        `INSERT INTO ledger_events (event_id, job_id, occurred_at, payload_json)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(event_id) DO NOTHING`
      )
      .run(event.eventId, event.jobId, event.occurredAt.toISOString(), serializeJson(event));

    return Promise.resolve();
  }

  listByJobId(jobId: string) {
    const rows = this.store.db
      .prepare("SELECT payload_json FROM ledger_events WHERE job_id = ? ORDER BY occurred_at, event_id")
      .all(jobId) as Row[];

    return Promise.resolve(rows.map((row) => deserializeJson<VerdictLedgerEvent>(row.payload_json)));
  }
}

export type SQLiteRuntimeRepositories = {
  acceptanceCriterionRepository: SQLiteAcceptanceCriterionRepository;
  adjudicationCaseRepository: SQLiteAdjudicationCaseRepository;
  artifactManifestRepository: SQLiteArtifactManifestRepository;
  consensusResultRepository: SQLiteConsensusResultRepository;
  feedbackRepository: SQLiteAgentFeedbackRepository;
  finalVerdictRepository: SQLiteFinalVerdictRepository;
  humanResponseRepository: SQLiteHumanResponseRepository;
  humanReviewTaskRepository: SQLiteHumanReviewTaskRepository;
  jobRepository: SQLiteVerificationJobRepository;
  ledgerRepository: SQLiteVerdictLedgerRepository;
  privacyClassificationRepository: SQLitePrivacyClassificationRepository;
  selfVerificationResultRepository: SQLiteSelfVerificationResultRepository;
  store: SQLiteRuntimeStore;
};

export function createSQLiteRuntimeRepositories(databasePath: string): SQLiteRuntimeRepositories {
  const store = new SQLiteRuntimeStore(databasePath);

  return {
    acceptanceCriterionRepository: new SQLiteAcceptanceCriterionRepository(store),
    adjudicationCaseRepository: new SQLiteAdjudicationCaseRepository(store),
    artifactManifestRepository: new SQLiteArtifactManifestRepository(store),
    consensusResultRepository: new SQLiteConsensusResultRepository(store),
    feedbackRepository: new SQLiteAgentFeedbackRepository(store),
    finalVerdictRepository: new SQLiteFinalVerdictRepository(store),
    humanResponseRepository: new SQLiteHumanResponseRepository(store),
    humanReviewTaskRepository: new SQLiteHumanReviewTaskRepository(store),
    jobRepository: new SQLiteVerificationJobRepository(store),
    ledgerRepository: new SQLiteVerdictLedgerRepository(store),
    privacyClassificationRepository: new SQLitePrivacyClassificationRepository(store),
    selfVerificationResultRepository: new SQLiteSelfVerificationResultRepository(store),
    store
  };
}

export type LocalQueueClaim = {
  attemptCount: number;
  availableAt: Date;
  claimId: string;
  claimedAt?: Date;
  jobId: string;
  jobName: string;
  payloadJson: string;
  state: "queued" | "claimed" | "completed";
};

export class SQLiteLocalQueueStore {
  constructor(private readonly store: SQLiteRuntimeStore) {}

  enqueue(claim: LocalQueueClaim) {
    this.store.db
      .prepare(
        `INSERT INTO local_queue_claims (
          claim_id, job_name, job_id, state, available_at, claimed_at, attempt_count, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(claim_id) DO UPDATE SET
          state = excluded.state,
          available_at = excluded.available_at,
          claimed_at = excluded.claimed_at,
          attempt_count = excluded.attempt_count,
          payload_json = excluded.payload_json`
      )
      .run(
        claim.claimId,
        claim.jobName,
        claim.jobId,
        claim.state,
        claim.availableAt.toISOString(),
        toTimestamp(claim.claimedAt),
        claim.attemptCount,
        claim.payloadJson
      );

    return Promise.resolve();
  }

  claimNext(jobName: string, now: Date) {
    const row = this.store.db
      .prepare(
        `SELECT claim_id, job_name, job_id, state, available_at, claimed_at, attempt_count, payload_json
         FROM local_queue_claims
         WHERE job_name = ? AND state = 'queued' AND available_at <= ?
         ORDER BY available_at, claim_id
         LIMIT 1`
      )
      .get(jobName, now.toISOString()) as
      | {
          claim_id: string;
          job_name: string;
          job_id: string;
          state: LocalQueueClaim["state"];
          available_at: string;
          claimed_at: string | null;
          attempt_count: number;
          payload_json: string;
        }
      | undefined;

    if (!row) {
      return Promise.resolve(null);
    }

    const claimedAt = now.toISOString();
    this.store.db
      .prepare(
        `UPDATE local_queue_claims
         SET state = 'claimed', claimed_at = ?, attempt_count = attempt_count + 1
         WHERE claim_id = ?`
      )
      .run(claimedAt, row.claim_id);

    return Promise.resolve({
      attemptCount: row.attempt_count + 1,
      availableAt: new Date(row.available_at),
      claimId: row.claim_id,
      claimedAt: new Date(claimedAt),
      jobId: row.job_id,
      jobName: row.job_name,
      payloadJson: row.payload_json,
      state: "claimed" as const
    });
  }

  markCompleted(claimId: string) {
    this.store.db
      .prepare("UPDATE local_queue_claims SET state = 'completed' WHERE claim_id = ?")
      .run(claimId);

    return Promise.resolve();
  }

  requeueExpired(ttlSeconds: number, now: Date) {
    const threshold = new Date(now.getTime() - ttlSeconds * 1000).toISOString();
    const result = this.store.db
      .prepare(
        `UPDATE local_queue_claims
         SET state = 'queued', claimed_at = NULL
         WHERE state = 'claimed' AND claimed_at <= ?`
      )
      .run(threshold);

    return Promise.resolve(Number(result.changes ?? 0));
  }
}
