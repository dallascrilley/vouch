import type { LogContext, Metrics } from "./observability.js";

type MetricEntry = {
  name: string;
  tags?: LogContext;
  value: number;
};

// Local runtime metrics sink. Production OTel export is a planned adapter — see docs/architecture/runtime-target.md.
export class InMemoryMetricsRecorder implements Metrics {
  private readonly increments: MetricEntry[] = [];
  private readonly gauges: MetricEntry[] = [];
  private readonly histograms: MetricEntry[] = [];

  increment(name: string, value = 1, tags?: LogContext) {
    this.increments.push({ name, tags, value });
  }

  gauge(name: string, value: number, tags?: LogContext) {
    this.gauges.push({ name, tags, value });
  }

  histogram(name: string, value: number, tags?: LogContext) {
    this.histograms.push({ name, tags, value });
  }

  snapshot() {
    return {
      gauges: [...this.gauges],
      histograms: [...this.histograms],
      increments: [...this.increments]
    };
  }
}
