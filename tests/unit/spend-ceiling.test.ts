import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

import { SpendCeiling } from "../../src/api/spend-ceiling.js";

describe("SpendCeiling", () => {
  it("reserves once per idempotency key and blocks cumulative overage", () => {
    const database = new DatabaseSync(":memory:");
    const ceiling = new SpendCeiling(database, 1);

    expect(
      ceiling.reserve({
        amountUsd: 0.6,
        idempotencyKey: "review-1",
        jobId: "job-1"
      })
    ).toMatchObject({ allowed: true, currentSpendUsd: 0.6 });
    expect(
      ceiling.reserve({
        amountUsd: 0.6,
        idempotencyKey: "review-1",
        jobId: "job-1"
      })
    ).toMatchObject({ allowed: true, currentSpendUsd: 0.6 });
    expect(
      ceiling.reserve({
        amountUsd: 0.5,
        idempotencyKey: "review-2",
        jobId: "job-2"
      })
    ).toMatchObject({ allowed: false, currentSpendUsd: 0.6 });
    expect(ceiling.current()).toBe(0.6);

    database.close();
  });
});
