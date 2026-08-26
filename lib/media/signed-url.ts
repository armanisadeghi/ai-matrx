// lib/media/signed-url.ts
//
// THE single source of truth for "is this a LEGACY signed, time-limited URL?"
// — across BOTH AWS signing dialects we ever emitted:
//
//   - SigV2 (query-string auth):
//       …?AWSAccessKeyId=AKIA…&Signature=…&Expires=<epoch-seconds>
//   - SigV4 (presigned):
//       …?X-Amz-Credential=…&X-Amz-Signature=…&X-Amz-Date=YYYYMMDDTHHMMSSZ&X-Amz-Expires=<seconds>
//
// WHY THIS STILL EXISTS after the durable-URL cutover: the platform no longer
// MINTS signed URLs anywhere (every emitted URL is durable), but old rows and
// old persisted content still CARRY them. The durability guards, adapters, and
// the service worker use this classifier to recognize a legacy expiring URL so
// it is never treated as a permanent CDN URL, never persisted as durable, and
// never cached. Route ALL signed-URL detection through here — never write a
// one-off `X-Amz` regex again.

/**
 * Matches either signing dialect. Intentionally broad: presence of any of these
 * query keys means the URL carries a time-limited signature and must be treated
 * as a legacy expiring URL (never durable, never persisted as identity).
 */
export const SIGNED_URL_RE =
  /[?&](x-amz-signature|x-amz-credential|x-amz-date|x-amz-expires|awsaccesskeyid|signature|expires)=/i;

/** True when `url` is a legacy signed/expiring URL in either AWS dialect. */
export function isSignedUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return SIGNED_URL_RE.test(url);
}
