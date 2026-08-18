import { describe, expect, it } from "vitest";

import { evaluateExternalizationPolicy } from "../../src/domain/privacy/externalization-policy.js";

describe("externalization policy", () => {
  it("allows public routes with safe public data", () => {
    expect(
      evaluateExternalizationPolicy({
        dataClass: "public",
        redactionStatus: "completed",
        reviewerPool: "public_crowd",
        route: "/demo"
      })
    ).toEqual({
      allowed: true,
      blockedReasons: [],
      decision: "allowed"
    });
  });

  it("blocks public crowd review for sensitive internal data", () => {
    expect(
      evaluateExternalizationPolicy({
        dataClass: "sensitive_internal",
        redactionStatus: "completed",
        reviewerPool: "public_crowd",
        route: "/demo"
      })
    ).toEqual({
      allowed: false,
      blockedReasons: [
        "public crowd review is blocked for sensitive internal data"
      ],
      decision: "managed_only"
    });
  });

  it("requires internal review for billing routes", () => {
    expect(
      evaluateExternalizationPolicy({
        dataClass: "internal_low",
        redactionStatus: "completed",
        reviewerPool: "managed",
        route: "/billing/invoices"
      })
    ).toEqual({
      allowed: false,
      blockedReasons: ["billing routes require internal review"],
      decision: "internal_only"
    });
    expect(
      evaluateExternalizationPolicy({
        dataClass: "internal_low",
        redactionStatus: "completed",
        reviewerPool: "internal",
        route: "/billing"
      })
    ).toEqual({
      allowed: true,
      blockedReasons: [],
      decision: "allowed"
    });
  });

  it("fails closed when redaction fails", () => {
    expect(
      evaluateExternalizationPolicy({
        dataClass: "public",
        redactionStatus: "failed",
        reviewerPool: "public_crowd",
        route: "/demo"
      })
    ).toEqual({
      allowed: false,
      blockedReasons: ["redaction did not complete successfully"],
      decision: "blocked_fail_closed"
    });
  });
});
