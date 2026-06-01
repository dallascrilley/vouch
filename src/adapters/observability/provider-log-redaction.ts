const SECRET_PATTERNS = [
  /authorization:\s*bearer\s+[^\s]+/gi,
  /provider_api_key[=:]\s*[^\s,]+/gi,
  /provider_shared_secret[=:]\s*[^\s,]+/gi
];

export function redactProviderSecrets(input: string) {
  return SECRET_PATTERNS.reduce(
    (output, pattern) => output.replace(pattern, (match) => `${match.split(/[=:]/)[0]}=[REDACTED]`),
    input
  );
}
