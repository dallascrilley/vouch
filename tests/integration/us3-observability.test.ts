import { describe, expect, it } from "vitest";

import { InMemoryMetricsRecorder } from "../../src/adapters/observability/metrics.js";

describe("US3 observability metrics", () => {
  it("records increments, gauges, and histograms for operator views", () => {
    const metrics = new InMemoryMetricsRecorder();

    metrics.increment("verification.jobs.created");
    metrics.gauge("verification.queue.depth", 3, { queue: "external" });
    metrics.histogram("verification.latency.seconds", 1.2, {
      stage: "consensus"
    });

    expect(metrics.snapshot()).toEqual({
      gauges: [
        {
          name: "verification.queue.depth",
          tags: { queue: "external" },
          value: 3
        }
      ],
      histograms: [
        {
          name: "verification.latency.seconds",
          tags: { stage: "consensus" },
          value: 1.2
        }
      ],
      increments: [
        { name: "verification.jobs.created", tags: undefined, value: 1 }
      ]
    });
  });
});
