export type ReviewDataClass =
  | "public"
  | "internal_low"
  | "sensitive_internal"
  | "regulated_or_secret";

const DATA_CLASSES: ReviewDataClass[] = [
  "public",
  "internal_low",
  "sensitive_internal",
  "regulated_or_secret"
];

export function classifyArtifact(value: string | undefined): ReviewDataClass {
  const dataClass = value ?? "internal_low";
  if (!DATA_CLASSES.includes(dataClass as ReviewDataClass)) {
    throw new Error(
      `data_class must be one of: ${DATA_CLASSES.join(", ")}; received ${dataClass}`
    );
  }
  return dataClass as ReviewDataClass;
}
