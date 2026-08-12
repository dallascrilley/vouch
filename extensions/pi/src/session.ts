import type {
  ExtensionAPI,
  ExtensionContext
} from "@earendil-works/pi-coding-agent";

import type { BrokerSupervisor } from "./broker-supervisor.js";
import type {
  ReviewHandleRegistry,
  ReviewEnvelope,
  ReviewHandleRecord
} from "./review-client.js";

type SessionClient = {
  list(): ReviewHandleRecord[];
  status(
    handle: string,
    input: {
      brokerBaseUrl: string;
      operatorToken?: string;
    }
  ): Promise<ReviewEnvelope>;
};

export type SessionReviewTrackerOptions = {
  client: SessionClient;
  currentContentHash?: (record: ReviewHandleRecord) => string | undefined;
  registry: ReviewHandleRegistry;
  supervisor: Pick<
    BrokerSupervisor,
    "ensureRunning" | "detach" | "isLive" | "startBridge"
  >;
};

export type SessionReconcileContext = {
  brokerBaseUrl: string;
  notify: (message: string, type?: "info" | "warning" | "error") => void;
  operatorToken?: string;
};

export function terminalReview(envelope: ReviewEnvelope | undefined): boolean {
  return (
    envelope?.status === "settled" ||
    envelope?.status === "not_reviewed" ||
    envelope?.expired === true
  );
}

function staleEnvelope(
  envelope: ReviewEnvelope,
  record: ReviewHandleRecord,
  currentContentHash?: string
): ReviewEnvelope {
  if (
    envelope.status === "settled" &&
    currentContentHash !== record.contentHash
  ) {
    return {
      ...envelope,
      agent_next_action: "retry",
      feedback: envelope.feedback
        ? {
            ...envelope.feedback,
            agent_next_action: "retry",
            final_verdict:
              envelope.feedback.final_verdict ??
              envelope.final_verdict ??
              "unclear",
            retry_allowed: false,
            retry_reason:
              currentContentHash === undefined
                ? "reviewed content could not be revalidated"
                : "reviewed content changed after human review"
          }
        : undefined,
      blockingReasons: [
        ...(envelope.blockingReasons ?? []),
        currentContentHash === undefined
          ? "reviewed content could not be revalidated"
          : "reviewed content changed after human review"
      ],
      stale: true
    };
  }
  if (
    currentContentHash === undefined ||
    currentContentHash === record.contentHash
  ) {
    return envelope;
  }
  return {
    ...envelope,
    agent_next_action: "retry",
    feedback: envelope.feedback
      ? {
          ...envelope.feedback,
          agent_next_action: "retry",
          final_verdict:
            envelope.feedback.final_verdict ??
            envelope.final_verdict ??
            "unclear",
          retry_allowed: false,
          retry_reason: "reviewed content changed after human review"
        }
      : undefined,
    stale: true,
    blockingReasons: [
      ...(envelope.blockingReasons ?? []),
      "reviewed content changed after human review"
    ]
  };
}

export class SessionReviewTracker {
  constructor(private readonly options: SessionReviewTrackerOptions) {}

  async reconcile(context: SessionReconcileContext): Promise<void> {
    const records = this.options.client.list();
    for (const record of records) {
      let envelope = record.envelope;
      if (!terminalReview(envelope)) {
        try {
          envelope = await this.options.client.status(record.handle, {
            brokerBaseUrl: context.brokerBaseUrl,
            operatorToken: context.operatorToken
          });
          this.options.registry.update(record.idempotencyKey, envelope);
        } catch (error) {
          context.notify(
            `Vouch review ${record.handle} could not be reconciled: ${
              error instanceof Error ? error.message : String(error)
            }`,
            "warning"
          );
          continue;
        }
      }

      if (!envelope || record.surfacedAt) continue;
      if (envelope.status === "ambient" && record.deadlineAt) {
        if (Date.parse(record.deadlineAt) <= Date.now()) {
          envelope = {
            ...envelope,
            blockingReasons: ["review deadline elapsed while Pi was closed"],
            expired: true
          };
          this.options.registry.update(record.idempotencyKey, envelope);
        } else {
          continue;
        }
      }

      const surfaced = staleEnvelope(
        envelope,
        record,
        this.options.currentContentHash?.(record)
      );
      this.options.registry.update(record.idempotencyKey, surfaced);
      this.options.registry.markSurfaced(record.idempotencyKey);
      const provenance = surfaced.simulated ? "SIMULATED" : "REAL";
      const state = surfaced.stale
        ? "stale"
        : surfaced.expired
          ? "expired"
          : surfaced.status;
      context.notify(
        `Vouch review ${record.handle}: ${state} (${provenance})\n${JSON.stringify(surfaced)}`,
        surfaced.stale || surfaced.expired ? "warning" : "info"
      );
    }
  }

  async onSessionStart(ctx: ExtensionContext): Promise<void> {
    const records = this.options.client.list();
    const inFlight = records.some((record) => !terminalReview(record.envelope));
    let connection = {
      baseUrl: "http://127.0.0.1:31337",
      operatorToken: undefined as string | undefined
    };
    if (inFlight) {
      try {
        connection = await this.options.supervisor.ensureRunning();
        if (this.options.supervisor.isLive) {
          await this.options.supervisor.startBridge();
        }
      } catch (error) {
        ctx.ui.notify(
          `Vouch broker recovery failed: ${error instanceof Error ? error.message : String(error)}`,
          "error"
        );
        return;
      }
    } else if (this.options.supervisor.isLive) {
      // A fresh Pi session still needs to reconnect the live bridge before its
      // first tool call; waiting for an ambient record would be too late.
      try {
        connection = await this.options.supervisor.ensureRunning();
        if (this.options.supervisor.isLive) {
          await this.options.supervisor.startBridge();
        }
      } catch (error) {
        ctx.ui.notify(
          `Vouch broker startup failed: ${error instanceof Error ? error.message : String(error)}`,
          "warning"
        );
      }
    }
    await this.reconcile({
      brokerBaseUrl: connection.baseUrl,
      operatorToken: connection.operatorToken,
      notify: (message, type) => ctx.ui.notify(message, type)
    });
  }

  onSessionShutdown(): void {
    this.options.registry.flush();
    this.options.supervisor.detach();
  }
}

export function registerSessionLifecycle(
  pi: ExtensionAPI,
  tracker: SessionReviewTracker
): void {
  pi.on("session_start", async (_event, ctx) => {
    await tracker.onSessionStart(ctx);
  });
  pi.on("session_shutdown", () => {
    tracker.onSessionShutdown();
  });
}
