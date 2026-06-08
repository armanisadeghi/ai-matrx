// features/podcasts/generator/media.ts
//
// The podcast pipeline streams EXPIRING signed S3 URLs, e.g.
//   https://matrx-user-files.s3.amazonaws.com/{user_id}/{file_id}?…&Expires=…
// Stored and rendered raw, these break once the signature expires (the user's
// "Image failed to load" covers). The fix: recover the cld_files `file_id` from
// the path and hand the file handler a `file_id` MediaRef — it re-mints a fresh
// signed URL on every load (or serves the CDN/public URL), so the media is
// durable forever. Public/CDN URLs are already durable and pass through.

import { fileIdToMediaRef, urlToMediaRef } from "@/features/files";
import type { MediaRef } from "@/features/files";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Recover the cld_files file_id from a matrx-user-files signed S3 URL. */
export function fileIdFromSignedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    // Only our own user-files bucket is backed 1:1 by cld_files rows. Public
    // bucket / CDN URLs are already permanent — don't touch them.
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
 * Turn any podcast media URL into a DURABLE MediaRef for <InlineMediaRef>.
 * Expiring user-files URLs become `file_id` refs (re-minted on demand); already-
 * durable URLs (CDN / public bucket) pass through unchanged.
 */
export function podcastMediaRef(
  url: string | null | undefined,
): MediaRef | null {
  if (!url) return null;
  const fileId = fileIdFromSignedUrl(url);
  return fileId ? fileIdToMediaRef(fileId) : urlToMediaRef(url);
}
