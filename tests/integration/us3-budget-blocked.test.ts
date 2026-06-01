import { describe, expect, it } from "vitest";

import { LedgerService } from "../../src/domain/ledger/ledger-service.js";
import type { VerdictLedgerRepository } from "../../src/adapters/storage/repositories.js";

describe("US3 budget blocked event", () => {
  it("records a budget-blocked ledger event with the cap context", async () => {
    const recorded: unknown[] = [];
    const repository: VerdictLedgerRepository = {
      append(event) {
        recorded.push(event);
        return Promise.resolve();
      },
      listByJobId() {
        return Promise.resolve([]);
      }
    };
    const ledger = new LedgerService(repository);

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
