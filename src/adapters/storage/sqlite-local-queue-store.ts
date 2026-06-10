import { toTimestamp } from "./sqlite-codecs.js";
import type { SQLiteRuntimeStore } from "./sqlite-runtime-store.js";

export type LocalQueueClaim = {
  attemptCount: number;
  availableAt: Date;
  claimId: string;
  claimedAt?: Date;
  jobId: string;
  jobName: string;
  payloadJson: string;
  state: "queued" | "claimed" | "completed" | "failed";
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
    const claimedAt = now.toISOString();
    const row = this.store.db
      .prepare(
        `UPDATE local_queue_claims
         SET state = 'claimed', claimed_at = ?, attempt_count = attempt_count + 1
         WHERE claim_id = (
           SELECT claim_id FROM local_queue_claims
           WHERE job_name = ? AND state = 'queued' AND available_at <= ?
           ORDER BY available_at, claim_id
           LIMIT 1
         )
         RETURNING claim_id, job_name, job_id, state, available_at, claimed_at, attempt_count, payload_json`
      )
      .get(claimedAt, jobName, now.toISOString()) as
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

    return Promise.resolve({
      attemptCount: row.attempt_count,
      availableAt: new Date(row.available_at),
      claimId: row.claim_id,
      claimedAt: new Date(row.claimed_at ?? claimedAt),
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

  markFailed(claimId: string) {
    this.store.db
      .prepare("UPDATE local_queue_claims SET state = 'failed' WHERE claim_id = ?")
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
