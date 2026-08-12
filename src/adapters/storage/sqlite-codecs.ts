export function toTimestamp(value: Date | undefined) {
  return value ? value.toISOString() : null;
}

export function deserializeJson<T>(value: string): T {
  const parsed: unknown = JSON.parse(value, (_key, currentValue: unknown) => {
    if (
      typeof currentValue === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(currentValue)
    ) {
      const date = new Date(currentValue);
      if (!Number.isNaN(date.getTime())) {
        return date;
      }
    }
    return currentValue;
  });

  return parsed as T;
}

export function serializeJson<T>(value: T) {
  const serialized = JSON.stringify(value, (_key, currentValue: unknown) =>
    currentValue instanceof Date ? currentValue.toISOString() : currentValue
  );

  return serialized;
}
