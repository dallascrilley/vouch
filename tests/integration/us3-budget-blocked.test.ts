import { describe, expect, it } from "vitest";

import { LedgerService } from "../../src/domain/ledger/ledger-service.js";

describe("US3 budget blocked event", () => {
  it("records a budget-blocked ledger event with the cap context", async () => {
    const recorded: unknown[] = [];
    const ledger = new LedgerService({
      append(event) {
        recorded.push(event);
        return Promise.resolve();
      }
    });

    const event = await ledger.recordBudgetBlocked({
      attemptedCost: 50,
      capType: "maxJobCost",
      configuredCap: 25,
      correlationId: "budget-blocked-1",
      currentSpend: 30,
      jobId: "job-budget",
      payloadHash: "payload-budget",
      policyVersion: "v1",
      resultingAction: "fail_closed"
    });

    expect(event.eventType).toBe("verification.budget.blocked");
    expect(recorded).toContainEqual(event);
  });
});
