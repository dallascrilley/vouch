import { SQLiteLocalQueueStore } from "../../adapters/storage/sqlite-repositories.js";
import { createSQLiteRuntimeRepositories } from "../../adapters/storage/sqlite-repositories.js";
import type { SQLiteRuntimeRepositories } from "../../adapters/storage/sqlite-repositories.js";
import type { TransactionManager } from "../../adapters/storage/transaction-manager.js";
import type { RuntimeConfig } from "../../config/runtime.js";
import { SpendCeiling } from "../spend-ceiling.js";

export type RuntimeStores = {
  queueStore: SQLiteLocalQueueStore;
  repositories: SQLiteRuntimeRepositories;
  spendCeiling: SpendCeiling;
  transactionManager: TransactionManager;
  close: () => void;
};

/**
 * Opens the SQLite runtime store and everything that shares its connection.
 *
 * `transactionManager` is deliberately the same object as `repositories.store`:
 * every repository writes through that one connection, which is what makes
 * `inTransaction` work without passing a handle. See
 * `docs/decisions/0001-persistence-boundary.md`.
 */
export function createRuntimeStores(config: RuntimeConfig): RuntimeStores {
  const repositories = createSQLiteRuntimeRepositories(config.databasePath);
  const spendCeiling = new SpendCeiling(
    repositories.store.db,
    config.realSpendCeilingUsd
  );
  const queueStore = new SQLiteLocalQueueStore(repositories.store);

  return {
    queueStore,
    repositories,
    spendCeiling,
    transactionManager: repositories.store,
    close: () => repositories.store.close()
  };
}
