import { createHmac, timingSafeEqual } from "node:crypto";

export function createHealthProof(secret: string, challenge: string): string {
  return createHmac("sha256", secret)
    .update(`health:v1:${challenge}`)
    .digest("base64url");
}

export function verifyHealthProof(
  secret: string,
  challenge: string,
  proof: string
): boolean {
  const expected = Buffer.from(createHealthProof(secret, challenge));
  const actual = Buffer.from(proof);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
