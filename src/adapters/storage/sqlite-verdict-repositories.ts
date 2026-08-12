import type {
  AgentFeedbackRepository,
  FinalVerdictRepository,
  VerdictLedgerRepository
} from "./repositories.js";
import type {
  AgentFeedbackSignal,
  FinalVerdict,
  VerdictLedgerEvent
} from "../../domain/feedback/models.js";
import { deserializeJson, serializeJson } from "./sqlite-codecs.js";
import type { SQLiteRuntimeStore } from "./sqlite-runtime-store.js";

type Row = { payload_json: string };

export class SQLiteFinalVerdictRepository implements FinalVerdictRepository {
  constructor(private readonly store: SQLiteRuntimeStore) {}

  findByJobId(jobId: string) {
    const row = this.store.db
      .prepare("SELECT payload_json FROM final_verdicts WHERE job_id = ?")
      .get(jobId) as Row | undefined;

    return Promise.resolve(
      row ? deserializeJson<FinalVerdict>(row.payload_json) : null
    );
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

    return Promise.resolve(
      row ? deserializeJson<AgentFeedbackSignal>(row.payload_json) : null
    );
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
      .run(
        event.eventId,
        event.jobId,
        event.occurredAt.toISOString(),
        serializeJson(event)
      );

    return Promise.resolve();
  }

  listByJobId(jobId: string) {
    const rows = this.store.db
      .prepare(
        "SELECT payload_json FROM ledger_events WHERE job_id = ? ORDER BY occurred_at, rowid"
      )
      .all(jobId) as Row[];

    return Promise.resolve(
      rows.map((row) => deserializeJson<VerdictLedgerEvent>(row.payload_json))
    );
  }
}
