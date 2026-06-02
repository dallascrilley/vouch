export type LogContext = Record<string, string | number | boolean | undefined>;

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
}

export interface Metrics {
  increment(name: string, value?: number, tags?: LogContext): void;
  gauge(name: string, value: number, tags?: LogContext): void;
  histogram(name: string, value: number, tags?: LogContext): void;
}

export interface Tracer {
  inSpan<T>(name: string, fn: () => Promise<T>, attributes?: LogContext): Promise<T>;
}
