import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type {
  ProviderResponseReceiptRepository,
  ProviderTaskMappingRepository
} from "./repositories.js";
import type {
  ProviderResponseReceipt,
  ProviderTaskMapping
} from "../../domain/human-review/models.js";

function toTimestamp(value: Date) {
  return value.toISOString();
}

function parseDate(value: string) {
  return new Date(value);
}

export class SQLiteProviderStateStore {
  readonly db: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA busy_timeout = 5000;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS provider_task_mappings (
        review_task_id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL,
        provider_task_id TEXT NOT NULL UNIQUE,
        provider_assignment_scope TEXT NOT NULL,
        dispatch_status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS provider_response_receipts (
        dedupe_key TEXT PRIMARY KEY,
        receipt_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        provider_task_id TEXT NOT NULL,
        provider_response_id TEXT NOT NULL,
        delivery_mode TEXT NOT NULL,
        received_at TEXT NOT NULL,
        normalized_response_id TEXT
      );
    `);
  }

  close() {
    this.db.close();
  }
}

export class SQLiteProviderTaskMappingRepository implements ProviderTaskMappingRepository {
  constructor(private readonly store: SQLiteProviderStateStore) {}

  findByProviderTaskId(providerTaskId: string) {
    const row = this.store.db
      .prepare(
        `SELECT review_task_id, provider_id, provider_task_id, provider_assignment_scope, dispatch_status, created_at, updated_at
         FROM provider_task_mappings
         WHERE provider_task_id = ?`
      )
      .get(providerTaskId) as
      | {
          review_task_id: string;
          provider_id: string;
          provider_task_id: string;
          provider_assignment_scope: string;
          dispatch_status: ProviderTaskMapping["dispatchStatus"];
          created_at: string;
          updated_at: string;
        }
      | undefined;

    return Promise.resolve(row ? hydrateProviderTaskMapping(row) : null);
  }

  findByReviewTaskId(reviewTaskId: string) {
    const row = this.store.db
      .prepare(
        `SELECT review_task_id, provider_id, provider_task_id, provider_assignment_scope, dispatch_status, created_at, updated_at
         FROM provider_task_mappings
         WHERE review_task_id = ?`
      )
      .get(reviewTaskId) as
      | {
          review_task_id: string;
          provider_id: string;
          provider_task_id: string;
          provider_assignment_scope: string;
          dispatch_status: ProviderTaskMapping["dispatchStatus"];
          created_at: string;
          updated_at: string;
        }
      | undefined;

    return Promise.resolve(row ? hydrateProviderTaskMapping(row) : null);
  }

  save(mapping: ProviderTaskMapping) {
    this.store.db
      .prepare(
        `INSERT INTO provider_task_mappings (
          review_task_id, provider_id, provider_task_id, provider_assignment_scope, dispatch_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(review_task_id) DO UPDATE SET
          provider_id = excluded.provider_id,
          provider_task_id = excluded.provider_task_id,
          provider_assignment_scope = excluded.provider_assignment_scope,
          dispatch_status = excluded.dispatch_status,
          updated_at = excluded.updated_at`
      )
      .run(
        mapping.reviewTaskId,
        mapping.providerId,
        mapping.providerTaskId,
        mapping.providerAssignmentScope,
        mapping.dispatchStatus,
        toTimestamp(mapping.createdAt),
        toTimestamp(mapping.updatedAt)
      );

    return Promise.resolve();
  }
}

export class SQLiteProviderResponseReceiptRepository implements ProviderResponseReceiptRepository {
  constructor(private readonly store: SQLiteProviderStateStore) {}

  findByDedupeKey(dedupeKey: string) {
    const row = this.store.db
      .prepare(
        `SELECT dedupe_key, receipt_id, provider_id, provider_task_id, provider_response_id, delivery_mode, received_at, normalized_response_id
         FROM provider_response_receipts
         WHERE dedupe_key = ?`
      )
      .get(dedupeKey) as
      | {
          dedupe_key: string;
          receipt_id: string;
          provider_id: string;
          provider_task_id: string;
          provider_response_id: string;
          delivery_mode: ProviderResponseReceipt["deliveryMode"];
          received_at: string;
          normalized_response_id: string | null;
        }
      | undefined;

    return Promise.resolve(row ? hydrateProviderResponseReceipt(row) : null);
  }

  save(receipt: ProviderResponseReceipt) {
    this.store.db
      .prepare(
        `INSERT INTO provider_response_receipts (
          dedupe_key, receipt_id, provider_id, provider_task_id, provider_response_id, delivery_mode, received_at, normalized_response_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(dedupe_key) DO UPDATE SET
          normalized_response_id = excluded.normalized_response_id`
      )
      .run(
        receipt.dedupeKey,
        receipt.receiptId,
        receipt.providerId,
        receipt.providerTaskId,
        receipt.providerResponseId,
        receipt.deliveryMode,
        toTimestamp(receipt.receivedAt),
        receipt.normalizedResponseId ?? null
      );

    return Promise.resolve();
  }
}

function hydrateProviderTaskMapping(row: {
  review_task_id: string;
  provider_id: string;
  provider_task_id: string;
  provider_assignment_scope: string;
  dispatch_status: ProviderTaskMapping["dispatchStatus"];
  created_at: string;
  updated_at: string;
}): ProviderTaskMapping {
  return {
    reviewTaskId: row.review_task_id,
    providerId: row.provider_id,
    providerTaskId: row.provider_task_id,
    providerAssignmentScope: row.provider_assignment_scope,
    dispatchStatus: row.dispatch_status,
    createdAt: parseDate(row.created_at),
    updatedAt: parseDate(row.updated_at)
  };
}

function hydrateProviderResponseReceipt(row: {
  dedupe_key: string;
  receipt_id: string;
  provider_id: string;
  provider_task_id: string;
  provider_response_id: string;
  delivery_mode: ProviderResponseReceipt["deliveryMode"];
  received_at: string;
  normalized_response_id: string | null;
}): ProviderResponseReceipt {
  return {
    dedupeKey: row.dedupe_key,
    receiptId: row.receipt_id,
    providerId: row.provider_id,
    providerTaskId: row.provider_task_id,
    providerResponseId: row.provider_response_id,
    deliveryMode: row.delivery_mode,
    receivedAt: parseDate(row.received_at),
    normalizedResponseId: row.normalized_response_id ?? undefined
  };
}
