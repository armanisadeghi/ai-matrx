/**
 * Execute a real browser download for a media action.
 *
 * `anchor_download` is a pure file-handler target: it returns the durable URL
 * and filename but deliberately does not touch the DOM. Package-owned media
 * shells need this host adapter to fetch the bytes through the canonical
 * handler, convert them to a same-origin blob URL, and click the anchor.
 * Using a blob URL matters for cross-origin CDN media because browsers ignore
 * the `download` attribute on a cross-origin URL.
 */

import { fileHandler } from "@/features/files/handler/handler";
import type { FileSource } from "@/features/files/handler/types";
import { recognizeOurFileUrl } from "@/lib/media/our-file-sources";
import type { MediaRefLike } from "@ai-matrx/media";

/**
 * Recover owned identity before downloading bytes.
 *
 * A permanent Matrx CDN URL is excellent for playback, but its response does
 * not opt into browser CORS. Treating it as an arbitrary external URL makes a
 * `fetch()`-backed download fail even though the URL renders in `<video>`.
 * The canonical recognizer knows the CDN key scheme and returns the owned
 * `file_id`, which lets the file handler use the authenticated byte client.
 */
export function mediaRefToDownloadSource(
  ref: MediaRefLike,
): FileSource | null {
  if (typeof ref !== "string" && ref.file_id) {
    return { kind: "file_id", fileId: ref.file_id };
  }

  const url = typeof ref === "string" ? ref : ref.url;
  if (!url) return null;
  return recognizeOurFileUrl(url)?.source ?? { kind: "external_url", url };
}

export async function downloadMediaSource(
  source: FileSource,
  suggestedName?: string,
): Promise<void> {
  const handle = fileHandler.use(source);
  const descriptor = await handle.as({
    kind: "anchor_download",
    suggestedName,
  });
  const blob = await handle.as({ kind: "blob" });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  try {
    anchor.href = objectUrl;
    anchor.download = descriptor.filename;
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    // Safari can cancel a save if the object URL is revoked in the same tick.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
  }
}
