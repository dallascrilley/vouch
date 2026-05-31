import { describe, expect, it, vi } from "vitest";

import { LedgerService } from "../../src/domain/ledger/ledger-service.js";
import type { VerdictLedgerRepository } from "../../src/adapters/storage/repositories.js";

describe("LedgerService", () => {
  it("appends a valid state transition event", async () => {
    const append = vi.fn<VerdictLedgerRepository["append"]>();
    const service = new LedgerService({ append });

    const event = await service.recordStateTransition("created", "artifacts_collected", {
      correlationId: "corr-1",
      jobId: "job-1",
      payloadHash: "payload-1",
      policyVersion: "policy-1"
    });

    expect(event.eventType).toBe("job.state.created.to.artifacts_collected");
    expect(append).toHaveBeenCalledWith(event);
  });

  it("rejects an invalid state transition", async () => {
    const append = vi.fn<VerdictLedgerRepository["append"]>();
    const service = new LedgerService({ append });

    await expect(
      service.recordStateTransition("created", "final_pass", {
        correlationId: "corr-2",
        jobId: "job-2",
        payloadHash: "payload-2",
        policyVersion: "policy-1"
      })
    ).rejects.toThrow("Invalid job state transition: created -> final_pass");

    expect(append).not.toHaveBeenCalled();
  });

  it("records an externalization decision as an append-only event", async () => {
    const append = vi.fn<VerdictLedgerRepository["append"]>();
    const service = new LedgerService({ append });

    const event = await service.recordExternalizationDecision({
      artifactHashes: ["hash-1"],
      correlationId: "corr-3",
      costDelta: 10,
      decision: "allowed",
      jobId: "job-3",
      payloadHash: "payload-3",
      policyVersion: "policy-2"
    });

    expect(event.eventType).toBe("privacy.externalization.allowed");
    expect(event.costDelta).toBe(10);
    expect(append).toHaveBeenCalledWith(event);
  });
});
