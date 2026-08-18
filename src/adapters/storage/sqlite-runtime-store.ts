import { AsyncLocalStorage } from "node:async_hooks";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { applySqliteMigrations } from "./sqlite-migrations.js";
import type { TransactionManager } from "./transaction-manager.js";

export class SQLiteRuntimeStore implements TransactionManager {
  readonly db: DatabaseSync;

  // Every repository writes through the single `db` handle, so "already in a
  // transaction" has to mean "this async context is inside one", not "this
  // instance is". A plain depth counter cannot tell the difference: a second
  // request entering while the first is suspended reads depth > 0, skips its
  // own BEGIN, and silently joins the first request's transaction -- so an
  // unrelated rollback destroys writes that request was told had committed.
  //
  // Not reachable today: every operation passed to inTransaction awaits only
  // synchronous work (node:sqlite is synchronous, LocalArtifactStore uses the
  // sync fs calls), so a transaction completes inside one microtask drain and
  // no second request can enter. It becomes reachable the moment any
  // transaction awaits real I/O, and it is guaranteed under the PostgreSQL
  // target in docs/architecture/runtime-target.md, where a pooled async driver
  // interleaves by design.
  private readonly transactionContext = new AsyncLocalStorage<true>();
  private transactionQueue: Promise<unknown> = Promise.resolve();

  constructor(path: string) {
    if (path !== ":memory:") {
      mkdirSync(dirname(path), { recursive: true });
    }

    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA busy_timeout = 5000;");
    applySqliteMigrations(this.db);
  }

  close() {
    this.db.close();
  }

  async inTransaction<T>(operation: () => Promise<T>): Promise<T> {
    // Genuine re-entry from inside an open transaction joins it, as before.
    if (this.transactionContext.getStore()) {
      return operation();
    }

    const run = async (): Promise<T> => {
      this.db.exec("BEGIN IMMEDIATE");
      try {
        const result = await this.transactionContext.run(true, operation);
        this.db.exec("COMMIT");
        return result;
      } catch (error) {
        this.db.exec("ROLLBACK");
        throw error;
      }
    };

    // One connection means one transaction at a time. Chain top-level
    // transactions so a concurrent caller waits rather than corrupting the
    // one in flight. Nested calls never reach here, so this cannot deadlock.
    const result = this.transactionQueue.then(run, run);
    this.transactionQueue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }
}
