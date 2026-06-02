import { describe, expect, it } from "vitest";

import { internalReviewerCapability } from "../../src/adapters/providers/internal-reviewer-adapter.js";
import { publicProviderCapability } from "../../src/adapters/providers/public-provider-adapter.js";
import { selectProviderForPool } from "../../src/domain/human-review/provider-routing-policy.js";

describe("provider routing policy", () => {
  it("prefers the requested healthy provider", () => {
    const provider = selectProviderForPool({
      health: {
        "internal-reviewer": "healthy",
        "public-crowd": "healthy"
      },
      pool: "public_crowd",
      preferredProviderId: "public-crowd",
      providers: [internalReviewerCapability, publicProviderCapability]
    });

    expect(provider?.providerId).toBe("public-crowd");
  });

  it("falls back when the preferred provider is down", () => {
    const provider = selectProviderForPool({
      health: {
        "internal-reviewer": "healthy",
        "public-crowd": "down"
      },
      pool: "internal",
      preferredProviderId: "public-crowd",
      providers: [internalReviewerCapability, publicProviderCapability]
    });

    expect(provider?.providerId).toBe("internal-reviewer");
  });
});
