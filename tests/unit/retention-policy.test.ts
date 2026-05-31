import { describe, expect, it } from "vitest";

import { computeRetentionExpiry } from "../../src/domain/ledger/retention-policy.js";

describe("retention policy", () => {
  it("applies the configured retention window by category", () => {
    const createdAt = new Date("2026-06-01T00:00:00.000Z");
    expect(computeRetentionExpiry("raw-artifacts", createdAt).toISOString()).toBe(
      "2026-07-01T00:00:00.000Z"
    );
    expect(computeRetentionExpiry("sanitized-packages", createdAt).toISOString()).toBe(
      "2026-06-15T00:00:00.000Z"
    );
  });
});
