/**
 * features/commerce-intake/labels/codes.ts
 *
 * Code minting + payload/normalization rules for the commerce label pool.
 *
 * - Codes are OPAQUE: a confusable-free alphabet (no 0/O, no 1/I/L) so a
 *   human reading a scuffed label aloud can't transpose look-alikes.
 * - 14 random characters over a 31-char alphabet ≈ 69 bits of entropy
 *   (≥ the 64-bit floor), drawn from `crypto.getRandomValues` with rejection
 *   sampling so every character is uniform.
 * - The PRINTED payload is the short durable resolver URL
 *   `https://aimatrx.com/l/<code>` (PRINT-PACKAGE-DESIGN Decision 3); every
 *   scanner must accept BOTH the bare code and the URL form — that is what
 *   `normalizeScannedCode` does.
 */

/** No 0/O, no 1/I/L — 31 characters. */
export const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** 14 chars × log2(31) ≈ 69.4 bits — comfortably over the 64-bit floor. */
export const CODE_LENGTH = 14;

const RESOLVER_ORIGIN = "https://aimatrx.com";

/** One uniformly random code body (no prefix). */
export function generateCodeBody(): string {
  const out: string[] = [];
  const max = 256 - (256 % CODE_ALPHABET.length); // rejection-sampling bound
  const buf = new Uint8Array(CODE_LENGTH * 2);
  while (out.length < CODE_LENGTH) {
    crypto.getRandomValues(buf);
    for (const byte of buf) {
      if (out.length >= CODE_LENGTH) break;
      if (byte >= max) continue;
      out.push(CODE_ALPHABET[byte % CODE_ALPHABET.length]);
    }
  }
  return out.join("");
}

/** A full code value: optional human prefix, then the random body. */
export function generateCodeValue(prefix?: string | null): string {
  const clean = (prefix ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const body = generateCodeBody();
  return clean ? `${clean}-${body}` : body;
}

/** The QR payload printed on the physical label. */
export function labelUrlForCode(value: string): string {
  return `${RESOLVER_ORIGIN}/l/${value}`;
}

/**
 * Turn whatever a scanner produced into the bare code/identifier value:
 * strips the `…/l/<code>` resolver-URL wrapper (any origin — a staging
 * domain must still claim) and trims. A non-URL value passes through
 * unchanged: typed serials and legacy QR strings are identifiers too.
 */
export function normalizeScannedCode(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(
    /^[a-z][a-z0-9+.-]*:\/\/[^/]+\/l\/([^/?#\s]+)\/?(?:[?#].*)?$/i,
  );
  if (match) return decodeURIComponent(match[1]);
  return trimmed;
}
