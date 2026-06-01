export type RuntimeStoreConfig = {
  artifactRoot: string;
  databasePath: string;
  queueClaimTtlSeconds: number;
};

export type LocalQueueClaimState = "queued" | "claimed" | "completed";
