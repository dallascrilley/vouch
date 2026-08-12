import type { DatabaseSync } from "node:sqlite";

export function applySqliteMigrations(database: DatabaseSync) {
  database.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS verification_jobs (
      job_id TEXT PRIMARY KEY,
      idempotency_key TEXT NOT NULL UNIQUE,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS acceptance_criteria (
      criterion_id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS artifact_manifests (
      manifest_id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS privacy_classifications (
      job_id TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS self_verification_results (
      job_id TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS human_review_tasks (
      review_task_id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      idempotency_key TEXT,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS human_responses (
      response_id TEXT PRIMARY KEY,
      review_task_id TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS consensus_results (
      job_id TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS adjudication_cases (
      job_id TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS final_verdicts (
      job_id TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS feedback_signals (
      job_id TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ledger_events (
      event_id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS local_queue_claims (
      claim_id TEXT PRIMARY KEY,
      job_name TEXT NOT NULL,
      job_id TEXT NOT NULL,
      state TEXT NOT NULL,
      available_at TEXT NOT NULL,
      claimed_at TEXT,
      attempt_count INTEGER NOT NULL,
      payload_json TEXT NOT NULL
    );
  `);

  // Older local broker databases predate the task-level idempotency column.
  // Upgrade them in place without making startup fail on a second run.
  try {
    database.exec(
      "ALTER TABLE human_review_tasks ADD COLUMN idempotency_key TEXT"
    );
  } catch {
    // The column already exists.
  }
  database.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS human_review_tasks_idempotency_key_idx
      ON human_review_tasks (idempotency_key)
      WHERE idempotency_key IS NOT NULL;
  `);
}
