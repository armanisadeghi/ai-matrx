/**
 * features/files/blocks/image/helpers/parse-signed-url-expiry.ts
 *
 * Extract the expiry timestamp from an AWS SigV4 presigned URL.
 *
 * SigV4 URLs carry two query params we care about:
 *   X-Amz-Date    = "YYYYMMDDTHHMMSSZ"   (UTC, the moment the URL was signed)
 *   X-Amz-Expires = "N"                  (seconds until expiry)
 *
 * Returns ms epoch (Date.now()-style) when both are present and parseable.
 * Returns null otherwise — the caller treats null as "expiry unknown" and
 * either trusts Python's `signedUrlExpiresAt` if available or schedules a
 * defensive refresh.
 */

const AWS_DATE_RE = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/;

export function parseSignedUrlExpiry(
  url: string | null | undefined,
): number | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const date = parsed.searchParams.get("X-Amz-Date");
  const expires = parsed.searchParams.get("X-Amz-Expires");
  if (!date || !expires) return null;
  const m = AWS_DATE_RE.exec(date);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const signedAt = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s),
  );
  const expiresInSec = Number(expires);
  if (!Number.isFinite(signedAt) || !Number.isFinite(expiresInSec)) return null;
  return signedAt + expiresInSec * 1000;
}
