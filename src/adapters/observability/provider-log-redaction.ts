// Sensitive key names recognised across header, query-string, and JSON forms.
const SENSITIVE_KEY_PATTERN =
  "authorization|set-cookie|cookie|x-api-key|api[_-]?key|apikey|provider_api_key|" +
  "access[_-]?token|refresh[_-]?token|token|client[_-]?secret|shared[_-]?secret|" +
  "provider_shared_secret|secret|password|passwd|passphrase";

const PATTERNS: Array<[RegExp, string]> = [
  // Bearer tokens anywhere (e.g. `Authorization: Bearer abc123`).
  [/bearer\s+[^\s,;"']+/gi, "Bearer [REDACTED]"],
  // JSON object form: "key": "value"
  [
    new RegExp(`("(?:${SENSITIVE_KEY_PATTERN})"\\s*:\\s*)"[^"]*"`, "gi"),
    '$1"[REDACTED]"'
  ],
  // Header / query-string / kv form: key=value or key: value (quoted or not).
  [
    new RegExp(
      `\\b(${SENSITIVE_KEY_PATTERN})\\s*[=:]\\s*"?[^\\s,;"']+"?`,
      "gi"
    ),
    "$1=[REDACTED]"
  ]
];

export function redactProviderSecrets(input: string) {
  return PATTERNS.reduce(
    (output, [pattern, replacement]) => output.replace(pattern, replacement),
    input
  );
}
