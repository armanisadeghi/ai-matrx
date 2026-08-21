"use client";

/**
 * features/research/components/media/ownedMedia.tsx
 *
 * Research media comes in two flavours and they are NOT interchangeable:
 *
 *   - DISCOVERED — an image/PDF/video the scraper or the extension found on a
 *     page. `url` holds that page's external URL and `file_id` is null.
 *   - OWNED — an artifact WE store: the upload sink behind
 *     `POST /research/topics/{tid}/sources/upload` (the extension's
 *     `screenshot` / `download` enrich goals). `file_id` names the cld_files
 *     row; `url` holds the only durable pointer that exists — the public CDN
 *     URL when the file is public, else the bare `file_id`.
 *
 * The server used to write the freshly-minted SIGNED S3 URL into `rs_media.url`
 * for owned rows, and this gallery rendered it straight into `<img src>`. It
 * worked for a few hours and then 403'd. **A signed URL is a handoff, never an
 * identity** — so owned rows now render through `InlineMediaRef`, which
 * re-mints from the `file_id` on read (and prefers the CDN URL for public
 * files), and "open"/"download" mint a fresh signed URL at click time.
 */

import { useCallback } from "react";
import { toast } from "@/lib/toast";
import { InlineMediaRef } from "@/features/files/components/inline/InlineMediaRef";
import {
  fileIdToMediaRef,
  urlToMediaRef,
} from "@/features/files/redux/converters";
import { getSignedUrl } from "@/features/files/api/files";
import type { MediaRef } from "@/features/files/types";
import type { ResearchMedia } from "../../types";

/** True when the row names a file we store (an upload), not a page reference. */
export function isOwnedMedia(item: ResearchMedia): boolean {
  return !!item.file_id;
}

/** Read the `mime_type` the server stamps on uploaded artifacts. */
export function mediaMimeType(item: ResearchMedia): string | null {
  const m = item.metadata;
  if (m && typeof m === "object" && !Array.isArray(m)) {
    const mime = (m as Record<string, unknown>).mime_type;
    if (typeof mime === "string" && mime) return mime;
  }
  return null;
}

/**
 * The canonical reference for a row: the `file_id` when we own the file (the
 * renderer re-mints), else the discovered URL. Never a stored signed URL.
 */
export function researchMediaRef(item: ResearchMedia): MediaRef {
  return item.file_id
    ? fileIdToMediaRef(item.file_id, mediaMimeType(item))
    : urlToMediaRef(item.thumbnail_url || item.url, mediaMimeType(item));
}

/**
 * One image renderer for the whole gallery. Owned rows resolve through the
 * file handler (signed-URL cache, CDN preference); discovered rows render the
 * external URL. Sized by the parent — pass the box classes in `className`.
 */
export function ResearchMediaImage({
  item,
  className,
  fit = "cover",
}: {
  item: ResearchMedia;
  className?: string;
  fit?: "cover" | "contain" | "fill";
}) {
  return (
    <InlineMediaRef
      ref={researchMediaRef(item)}
      size="fill"
      fit={fit}
      alt={item.alt_text || ""}
      as="img"
      fallback="icon"
      rounded="none"
      className={className}
    />
  );
}

/**
 * Open a research media item in a new tab. Discovered → its source URL. Owned
 * → a freshly minted signed URL (the handoff, made at the moment of use).
 */
export async function openResearchMedia(item: ResearchMedia): Promise<void> {
  if (!item.file_id) {
    window.open(item.url, "_blank", "noopener,noreferrer");
    return;
  }
  try {
    const { data } = await getSignedUrl(item.file_id);
    const url = data?.url;
    if (!url) throw new Error("no url in response");
    window.open(url, "_blank", "noopener,noreferrer");
  } catch (err) {
    console.error("[research/media] could not open owned file", item.file_id, err);
    toast.error("Couldn't open that file");
  }
}

/** `openResearchMedia` bound to an item, for click handlers. */
export function useOpenResearchMedia(item: ResearchMedia): () => void {
  return useCallback(() => {
    void openResearchMedia(item);
  }, [item]);
}
