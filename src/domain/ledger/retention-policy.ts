export type RetentionCategory =
  | "raw-artifacts"
  | "sanitized-packages"
  | "reviewer-responses"
  | "aggregate-metrics";

const dayInMs = 24 * 60 * 60 * 1000;

const retentionDays: Record<RetentionCategory, number> = {
  "raw-artifacts": 30,
  "sanitized-packages": 14,
  "reviewer-responses": 90,
  "aggregate-metrics": 365
};

export function computeRetentionExpiry(
  category: RetentionCategory,
  createdAt: Date
) {
  return new Date(createdAt.getTime() + retentionDays[category] * dayInMs);
}
