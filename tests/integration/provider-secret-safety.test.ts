import { describe, expect, it } from "vitest";

import { redactProviderSecrets } from "../../src/adapters/observability/provider-log-redaction.js";

describe("provider secret safety", () => {
  it("redacts provider api keys and shared secrets from logs", () => {
    const redacted = redactProviderSecrets(
      "provider_api_key=super-secret authorization: Bearer abc123 provider_shared_secret=shhh"
    );

    expect(redacted).not.toContain("super-secret");
    expect(redacted).not.toContain("abc123");
    expect(redacted).not.toContain("shhh");
    expect(redacted).toContain("[REDACTED]");
  });
});
