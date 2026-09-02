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
