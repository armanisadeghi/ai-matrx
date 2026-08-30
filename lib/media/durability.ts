// lib/media/durability.ts
//
// The frontend twin of the database `mtx_is_durable_media_url` guard. The
// classification itself (durable vs. expiring, the revocable-share-link
// rule, the fail-closed share guard) is canonical in `@ai-matrx/data/files`
// (the C9 collapse) and re-exported here so the 20+ existing call sites keep
// one import path. What stays host-side is the LOUD violation report — it
// writes to the app's Error Inspector capture store, which is host identity.
//
// Render durable media via the canonical `<InlineMediaRef>` (it re-mints from
// a file_id for authed owners). NEVER hand-render our media with a raw
// <img src>.

import {
  classifyMediaUrl,
  createFileUrlRecognizer,
  isDurableMediaUrl,
  shareableMediaUrl,
  type MediaUrlKind,
} from "@ai-matrx/data/files";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";

export { classifyMediaUrl, isDurableMediaUrl, shareableMediaUrl };
export type { MediaUrlKind };

const recognizer = createFileUrlRecognizer();

/**
 * Recover the cld_files file_id from an our-own user-files signed S3 URL
 * (`…/{user_id}/{file_id}?…`). Used to render via the handler (which
 * re-mints) or to publish the file. Returns null for non-user-files URLs.
 */
export function fileIdFromUserFilesUrl(url: string): string | null {
  return recognizer.fileIdFromUserFilesUrl(url);
}

/**
 * LOUD: log a durability violation. A non-public, expiring URL reaching
 * `context` means the media was persisted wrong server-side. Returns true if
 * it WAS a violation (so callers can trigger a heal), false otherwise. Never
 * throws.
 */
export function reportMediaDurabilityViolation(
  url: string | null | undefined,
  context: string,
): boolean {
  if (classifyMediaUrl(url) !== "expiring") return false;
  try {
    captureError({
      source: "media-durability",
      relation: context,
      message: `Expiring media URL reached "${context}" — should be public/durable`,
      details: String(url).slice(0, 300),
      raw: { context, url: String(url) },
    });
  } catch {
    /* capture must never break the caller */
  }
  console.error(
    "\n================ MEDIA-DURABILITY VIOLATION ================\n" +
      `A non-public, EXPIRING media URL reached "${context}".\n` +
      "This must never be persisted/rendered for public or owned media — it WILL\n" +
      "break when the signature expires. The media should have been saved PUBLIC\n" +
      "at generation (durable CDN/public-bucket URL), or rendered via the file\n" +
      "handler (<InlineMediaRef> + file_id, which re-mints). See the frontend\n" +
      "FOUND_DEFECTS.md → 'Media durability'.\n" +
      `URL: ${String(url).slice(0, 180)}\n` +
      "===========================================================\n",
  );
  return true;
}
