// lib/media/signed-url.ts
//
// THE single source of truth for "is this a signed, time-limited URL, and when
// does it die?" — across BOTH AWS signing dialects we encounter:
//
//   - SigV2 (query-string auth, what our image backend currently mints):
//       …?AWSAccessKeyId=AKIA…&Signature=…&Expires=<epoch-seconds>
//   - SigV4 (presigned):
//       …?X-Amz-Credential=…&X-Amz-Signature=…&X-Amz-Date=YYYYMMDDTHHMMSSZ&X-Amz-Expires=<seconds>
//
// WHY THIS EXISTS (load-bearing invariant):
//   A user's own file NEVER "expires" from the user's point of view — we own the
//   file_id, so an expired URL is a non-event: re-mint it. The ONLY way the app
//   can honor that is if every layer agrees on what "signed/expiring" means. When
//   a detector recognizes only SigV4, a SigV2 URL gets mistaken for a PERMANENT
//   CDN URL, the re-mint path is skipped, and the image goes dark forever once the
//   signature dies. That exact bug (SigV4-only heuristics) is what this module
//   eliminates. Route ALL signed-URL detection/expiry through here — never write a
//   one-off `X-Amz` regex again.

/**
 * Matches either signing dialect. Intentionally broad: presence of any of these
 * query keys means the URL carries a time-limited signature and must be treated
 * as expiring (never persisted as durable, always re-mintable from a file_id).
 */
const SIGNED_URL_RE =
  /[?&](x-amz-signature|x-amz-credential|x-amz-date|x-amz-expires|awsaccesskeyid|signature|expires)=/i;

/** True when `url` is a signed/expiring URL in either AWS dialect. */
export function isSignedUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return SIGNED_URL_RE.test(url);
}

const AWS_DATE_RE = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/;

/**
 * Expiry of a signed URL as ms-epoch (Date.now()-style), or null when the URL
 * carries no parseable expiry (treat null as "unknown / assume it could already
 * be dead" — for owned files that means: prefer a fresh mint).
 *
 * Handles both dialects:
 *   - SigV4: `X-Amz-Date` (sign time) + `X-Amz-Expires` (TTL seconds).
 *   - SigV2: `Expires` (absolute epoch seconds).
 */
export function signedUrlExpiresAtMs(
  url: string | null | undefined,
): number | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const params = parsed.searchParams;

  // ── SigV4: X-Amz-Date + X-Amz-Expires ───────────────────────────────────
  const amzDate = params.get("X-Amz-Date");
  const amzExpires = params.get("X-Amz-Expires");
  if (amzDate && amzExpires) {
    const m = AWS_DATE_RE.exec(amzDate);
    const ttlSec = Number(amzExpires);
    if (m && Number.isFinite(ttlSec)) {
      const [, y, mo, d, h, mi, s] = m;
      const signedAt = Date.UTC(
        Number(y),
        Number(mo) - 1,
        Number(d),
        Number(h),
        Number(mi),
        Number(s),
      );
      if (Number.isFinite(signedAt)) return signedAt + ttlSec * 1000;
    }
  }

  // ── SigV2: Expires=<absolute epoch seconds> ──────────────────────────────
  const expires = params.get("Expires");
  if (expires) {
    const epochSec = Number(expires);
    // Sanity: real S3 SigV2 expiries are 10-digit second epochs. Reject obvious
    // non-timestamps (e.g. a UI "?expires=true") so we don't fabricate a date.
    if (Number.isFinite(epochSec) && epochSec > 1_000_000_000) {
      return epochSec * 1000;
    }
  }

  return null;
}

/**
 * Convenience: is this signed URL currently expired (or unparseable / about to
 * expire within `marginMs`)? Unknown-expiry signed URLs return `true` — we can't
 * prove freshness, so for an owned file the safe answer is "re-mint".
 */
export function isSignedUrlExpired(
  url: string | null | undefined,
  marginMs = 30_000,
): boolean {
  if (!isSignedUrl(url)) return false;
  const expiresAt = signedUrlExpiresAtMs(url);
  if (expiresAt === null) return true;
  return expiresAt <= Date.now() + marginMs;
}
