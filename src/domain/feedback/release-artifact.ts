import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import type { FinalVerdict, VerdictLedgerEvent } from "./models.js";

// Signed, externally consumable release-gate artifact. Carries only verdict
// metadata and hashes — never raw evidence or artifact contents.
export type ReleaseArtifact = {
  job_id: string;
  final_verdict: string;
  release_gate_effect: string;
  ledger_attestation_hash: string;
  signed_at: string;
  signature: string;
};

export type UnsignedReleaseArtifact = Omit<ReleaseArtifact, "signature">;

// Order-stable digest over the append-only ledger so any replayed event
// stream can be re-attested against the artifact.
export function computeLedgerAttestationHash(
  events: VerdictLedgerEvent[]
): string {
  const hash = createHash("sha256");
  for (const event of events) {
    hash.update(`${event.eventId}|${event.eventType}|${event.payloadHash}\n`);
  }
  return hash.digest("hex");
}

function canonicalPayload(artifact: UnsignedReleaseArtifact): string {
  return JSON.stringify({
    final_verdict: artifact.final_verdict,
    job_id: artifact.job_id,
    ledger_attestation_hash: artifact.ledger_attestation_hash,
    release_gate_effect: artifact.release_gate_effect,
    signed_at: artifact.signed_at
  });
}

export function buildReleaseArtifact(input: {
  ledger: VerdictLedgerEvent[];
  signedAt: Date;
  signingKey: string;
  verdict: FinalVerdict;
}): ReleaseArtifact {
  const unsigned: UnsignedReleaseArtifact = {
    job_id: input.verdict.jobId,
    final_verdict: input.verdict.finalVerdict,
    release_gate_effect: input.verdict.releaseGateEffect,
    ledger_attestation_hash: computeLedgerAttestationHash(input.ledger),
    signed_at: input.signedAt.toISOString()
  };

  return {
    ...unsigned,
    signature: createHmac("sha256", input.signingKey)
      .update(canonicalPayload(unsigned))
      .digest("hex")
  };
}

export function verifyReleaseArtifact(
  artifact: ReleaseArtifact,
  signingKey: string
): boolean {
  const expected = createHmac("sha256", signingKey)
    .update(canonicalPayload(artifact))
    .digest();
  const provided = Buffer.from(artifact.signature, "hex");
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}
