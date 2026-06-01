export const localQueueJobNames = {
  adjudication: "adjudication",
  escalation: "escalation",
  providerDispatch: "provider-dispatch",
  providerIngestion: "provider-ingestion",
  selfVerification: "self-verification"
} as const;

export type LocalQueueJobName =
  (typeof localQueueJobNames)[keyof typeof localQueueJobNames];
