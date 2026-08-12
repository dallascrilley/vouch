import type { DatabaseSync } from "node:sqlite";
import type { HumanReviewTask } from "../domain/human-review/models.js";

export type SpendReservation = {
  allowed: boolean;
  attemptedCostUsd: number;
  ceilingUsd?: number;
  currentSpendUsd: number;
};

export type DispatchPricing = {
  max_assignments: number;
  reward: string;
};

export function parseDispatchPricing(
  taskTemplate: string
): DispatchPricing | undefined {
  try {
    const parsed = JSON.parse(taskTemplate) as {
      pricing?: unknown;
      v?: unknown;
    };
    if (
      parsed.v !== 1 ||
      !parsed.pricing ||
      typeof parsed.pricing !== "object" ||
      Array.isArray(parsed.pricing)
    ) {
      return undefined;
    }
    const pricing = parsed.pricing as {
      max_assignments?: unknown;
      reward?: unknown;
    };
    if (
      typeof pricing.max_assignments !== "number" ||
      typeof pricing.reward !== "string"
    ) {
      return undefined;
    }
    return {
      max_assignments: pricing.max_assignments,
      reward: pricing.reward
    };
  } catch {
    return undefined;
  }
}

export function estimateDispatchSpend(pricing: DispatchPricing): number {
  const reward = Number(pricing.reward);
  if (
    !Number.isFinite(reward) ||
    reward <= 0 ||
    !Number.isInteger(pricing.max_assignments) ||
    pricing.max_assignments <= 0
  ) {
    throw new Error(
      "Real dispatch cost is unavailable because task pricing is invalid"
    );
  }
  return Math.round(reward * pricing.max_assignments * 1_000_000) / 1_000_000;
}

export function reserveRealProviderDispatch(input: {
  ceilingUsd?: number;
  idempotencyKey: string;
  jobId: string;
  spendCeiling: SpendCeiling;
  task: Pick<HumanReviewTask, "taskTemplate">;
}): void {
  if (input.ceilingUsd === undefined) return;
  const pricing = parseDispatchPricing(input.task.taskTemplate);
  if (!pricing) {
    throw new Error(
      "Real spend is blocked: structured task pricing and an idempotency key are required"
    );
  }
  const reservation = input.spendCeiling.reserve({
    amountUsd: estimateDispatchSpend(pricing),
    idempotencyKey: input.idempotencyKey,
    jobId: input.jobId
  });
  if (!reservation.allowed) {
    throw new Error(
      `Real spend ceiling reached; operator confirmation required (current $${reservation.currentSpendUsd.toFixed(2)}, attempted $${reservation.attemptedCostUsd.toFixed(2)}, ceiling $${reservation.ceilingUsd?.toFixed(2)})`
    );
  }
}

type ReservationInput = {
  amountUsd: number;
  idempotencyKey: string;
  jobId: string;
};

/** Durable, idempotent reservation ledger for real-provider dispatches. */
export class SpendCeiling {
  constructor(
    private readonly database: DatabaseSync,
    private readonly ceilingUsd?: number
  ) {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS vouch_spend_reservations (
        idempotency_key TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        amount_usd REAL NOT NULL,
        created_at TEXT NOT NULL
      )
    `);
  }

  reserve(input: ReservationInput): SpendReservation {
    if (!Number.isFinite(input.amountUsd) || input.amountUsd <= 0) {
      throw new Error("Real dispatch cost is unavailable or invalid");
    }
    if (!input.idempotencyKey.trim()) {
      throw new Error("Real dispatch idempotency key is required");
    }

    this.database.exec("BEGIN IMMEDIATE");
    try {
      const existing = this.database
        .prepare(
          "SELECT amount_usd, job_id FROM vouch_spend_reservations WHERE idempotency_key = ?"
        )
        .get(input.idempotencyKey) as
        | { amount_usd?: number; job_id?: string }
        | undefined;
      const currentSpendUsd = this.currentSpend();

      if (existing) {
        if (
          existing.amount_usd !== input.amountUsd ||
          existing.job_id !== input.jobId
        ) {
          throw new Error(
            "Real dispatch idempotency key conflicts with an existing reservation"
          );
        }
        this.database.exec("COMMIT");
        return {
          allowed: true,
          attemptedCostUsd: input.amountUsd,
          ceilingUsd: this.ceilingUsd,
          currentSpendUsd
        };
      }

      if (
        this.ceilingUsd !== undefined &&
        currentSpendUsd + input.amountUsd > this.ceilingUsd
      ) {
        this.database.exec("ROLLBACK");
        return {
          allowed: false,
          attemptedCostUsd: input.amountUsd,
          ceilingUsd: this.ceilingUsd,
          currentSpendUsd
        };
      }

      this.database
        .prepare(
          `INSERT INTO vouch_spend_reservations
            (idempotency_key, job_id, amount_usd, created_at)
           VALUES (?, ?, ?, ?)`
        )
        .run(
          input.idempotencyKey,
          input.jobId,
          input.amountUsd,
          new Date().toISOString()
        );
      this.database.exec("COMMIT");
      return {
        allowed: true,
        attemptedCostUsd: input.amountUsd,
        ceilingUsd: this.ceilingUsd,
        currentSpendUsd: currentSpendUsd + input.amountUsd
      };
    } catch (error) {
      try {
        this.database.exec("ROLLBACK");
      } catch {
        // Preserve the original SQLite error.
      }
      throw error;
    }
  }

  current(): number {
    return this.currentSpend();
  }

  release(idempotencyKey: string): void {
    this.database
      .prepare("DELETE FROM vouch_spend_reservations WHERE idempotency_key = ?")
      .run(idempotencyKey);
  }

  private currentSpend(): number {
    const row = this.database
      .prepare(
        "SELECT COALESCE(SUM(amount_usd), 0) AS current_spend_usd FROM vouch_spend_reservations"
      )
      .get() as { current_spend_usd?: number };
    return Number(row.current_spend_usd ?? 0);
  }
}
