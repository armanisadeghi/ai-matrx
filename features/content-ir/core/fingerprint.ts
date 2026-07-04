/**
 * Stable, fast content fingerprint for IR envelopes.
 *
 * Used as the idempotence / cache key: a persisted CanonicalBlockIR is only
 * reused when its fingerprint matches the region source text it claims to
 * represent. Not cryptographic — collision resistance at the "same message,
 * same block" scale is all that's required, and it must be synchronous and
 * dependency-free (runs per region on the hot streaming path).
 *
 * FNV-1a 32-bit, applied twice with different seeds and concatenated, so a
 * single 32-bit collision doesn't alias two regions.
 *
 * `createFingerprinter` is the incremental form for live streams: feeding
 * chunks one at a time yields EXACTLY the same fingerprint as
 * `fingerprintText` over the concatenation — sessions never re-hash the
 * whole source per flush.
 */

const SEED_A = 0x811c9dc5;
const SEED_B = 0x01000193;

function fnv1aStep(hash: number, input: string): number {
  let h = hash >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    // h *= 16777619 (FNV prime), in 32-bit space without BigInt.
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

export interface Fingerprinter {
  push(chunk: string): void;
  /** Fingerprint of everything pushed so far. */
  current(): string;
}

export function createFingerprinter(): Fingerprinter {
  let a = SEED_A;
  let b = SEED_B;
  let length = 0;

  return {
    push(chunk: string): void {
      a = fnv1aStep(a, chunk);
      b = fnv1aStep(b, chunk);
      length += chunk.length;
    },
    current(): string {
      return `${length.toString(36)}-${a.toString(36)}${b.toString(36)}`;
    },
  };
}

export function fingerprintText(source: string): string {
  const hasher = createFingerprinter();
  hasher.push(source);
  return hasher.current();
}
