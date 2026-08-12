export type QueueJobName =
  | "self-verification"
  | "escalation"
  | "provider-ingestion"
  | "adjudication";

export type QueueMessage<TPayload> = {
  correlationId: string;
  jobId: string;
  payload: TPayload;
};

export interface QueuePublisher {
  publish<TPayload>(
    jobName: QueueJobName,
    message: QueueMessage<TPayload>
  ): Promise<void>;
}

export interface QueueWorker<TPayload> {
  start(
    handler: (message: QueueMessage<TPayload>) => Promise<void>
  ): Promise<void>;
}
