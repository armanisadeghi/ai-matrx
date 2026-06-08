// features/podcasts/generator/media.ts
//
// The podcast pipeline streams EXPIRING signed S3 URLs. Stored/rendered raw they
// break once the signature expires (the "Image failed to load" covers). This
// turns a media URL into a DURABLE MediaRef for <InlineMediaRef>: recover the
// cld_files file_id from the S3 path so the handler re-mints a fresh URL on every
// load (or serves the CDN/public URL). Public/CDN URLs pass through unchanged.
//
// Classification + the loud-violation logger live in the shared lib/media layer
// (twin of the DB `mtx_is_durable_media_url` guard) so this rule is enforced the
// same way everywhere.

import { fileIdToMediaRef, urlToMediaRef } from "@/features/files";
import type { MediaRef } from "@/features/files";
import {
  fileIdFromUserFilesUrl,
  reportMediaDurabilityViolation,
} from "@/lib/media/durability";

/**
 * Turn any podcast media URL into a DURABLE MediaRef for <InlineMediaRef>.
 * Expiring user-files URLs become `file_id` refs (re-minted on demand); already-
 * durable URLs pass through. When `context` is given, an expiring URL also logs a
 * loud durability violation (it should have been saved public server-side).
 */
export function podcastMediaRef(
  url: string | null | undefined,
  context?: string,
): MediaRef | null {
  if (!url) return null;
  const fileId = fileIdFromUserFilesUrl(url);
  if (context) reportMediaDurabilityViolation(url, context);
  return fileId ? fileIdToMediaRef(fileId) : urlToMediaRef(url);
}
