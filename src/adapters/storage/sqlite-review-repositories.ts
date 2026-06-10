import type {
  AdjudicationCaseRepository,
  ConsensusResultRepository,
  HumanResponseRepository,
  HumanReviewTaskRepository
} from "./repositories.js";
import type { AdjudicationCase, ConsensusResult } from "../../domain/consensus/models.js";
import type { HumanResponse, HumanReviewTask } from "../../domain/human-review/models.js";
import { deserializeJson, serializeJson } from "./sqlite-codecs.js";
import type { SQLiteRuntimeStore } from "./sqlite-runtime-store.js";

type Row = { payload_json: string };

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
