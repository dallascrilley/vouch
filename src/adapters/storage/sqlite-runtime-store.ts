import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

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
