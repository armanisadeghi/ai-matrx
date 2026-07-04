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
 */

function fnv1a(input: string, seed: number): number {
  let hash = seed >>> 0;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // hash *= 16777619 (FNV prime), in 32-bit space without BigInt.
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash >>> 0;
}

export function fingerprintText(source: string): string {
  const a = fnv1a(source, 0x811c9dc5);
  const b = fnv1a(source, 0x01000193);
  return `${source.length.toString(36)}-${a.toString(36)}${b.toString(36)}`;
}
