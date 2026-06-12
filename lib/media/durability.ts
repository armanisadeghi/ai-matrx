// lib/media/durability.ts
//
// The frontend twin of the database `mtx_is_durable_media_url` guard. Two jobs:
//
//   1. CLASSIFY a media URL as durable (permanent) vs. expiring (a signed,
//      time-limited S3 link that WILL break days later).
//   2. LOUDLY surface a violation — when an expiring/private "our own" URL reaches
//      a render or store path, that is a server-side defect (media should have
//      been persisted public). We do NOT silently paper over it (that hides the
//      bug); we scream in the console so it can't be ignored, and the caller can
//      then route it through the canonical heal path.
//
// Render durable media via the canonical `<InlineMediaRef>` (it re-mints from a
// file_id for authed owners). NEVER hand-render our media with a raw <img src>.

const SIGNED_URL_RE = /[?&](x-amz-signature|x-amz-credential|expires|signature)=/i;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type MediaUrlKind = "empty" | "durable" | "expiring";

/** Mirror of the DB `mtx_is_durable_media_url` classifier. */
export function classifyMediaUrl(url: string | null | undefined): MediaUrlKind {
  if (!url) return "empty";
  return SIGNED_URL_RE.test(url) ? "expiring" : "durable";
}

export function isDurableMediaUrl(url: string | null | undefined): boolean {
  return classifyMediaUrl(url) !== "expiring";
}

/**
 * Recover the cld_files file_id from an our-own user-files signed S3 URL
 * (`…/{user_id}/{file_id}?…`). Used to render via the handler (which re-mints) or
 * to publish the file. Returns null for non-user-files URLs.
 */
export function fileIdFromUserFilesUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/(^|\.)matrx-user-files\.s3|s3[.-].*amazonaws\.com/i.test(u.hostname)) {
      return null;
    }
    const segs = u.pathname.split("/").filter(Boolean); // [user_id, file_id, …]
    const candidate = segs[1] ?? segs[segs.length - 1];
    return candidate && UUID_RE.test(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

/**
 * LOUD: log a durability violation. A non-public, expiring URL reaching `context`
 * means the media was persisted wrong server-side. Returns true if it WAS a
 * violation (so callers can trigger a heal), false otherwise. Never throws.
 */
export function reportMediaDurabilityViolation(
  url: string | null | undefined,
  context: string,
): boolean {
  if (classifyMediaUrl(url) !== "expiring") return false;
  console.error(
    "\n================ MEDIA-DURABILITY VIOLATION ================\n" +
      `A non-public, EXPIRING media URL reached "${context}".\n` +
      "This must never be persisted/rendered for public or owned media — it WILL\n" +
      "break when the signature expires. The media should have been saved PUBLIC\n" +
      "at generation (durable CDN/public-bucket URL), or rendered via the file\n" +
      "handler (<InlineMediaRef> + file_id, which re-mints). See the frontend\n" +
      "KNOWN_DEFECTS.md → 'Media durability'.\n" +
      `URL: ${String(url).slice(0, 180)}\n` +
      "===========================================================\n",
  );
  return true;
}
