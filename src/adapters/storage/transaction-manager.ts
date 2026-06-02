export interface TransactionManager {
  inTransaction<T>(operation: () => Promise<T>): Promise<T>;
}
