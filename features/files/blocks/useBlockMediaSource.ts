/**
 * features/files/blocks/useBlockMediaSource.ts
 *
 * THE hook that turns a unified media block (image or video) into the URL
 * the browser should render right now — the wave-2 replacement for the
 * deleted `useUnifiedImageUrl` / `useUnifiedVideoUrl` twins.
 *
 * Resolution and load recovery both ride `@ai-matrx/media`:
 *   - `useMediaResolution` resolves the block's durable identity through
 *     the ONE `MediaClient` (synchronous — durable URLs have no expiry, so
 *     there is no async "resolving" phase anymore);
 *   - `useMediaLoadRecovery` owns the load-error machine: the client's
 *     fixed retry contract (session refresh → same-URL retry once →
 *     terminal). The package may never grow a retry of its own, which is
 *     exactly what killed the two divergent copies this file replaces.
 *
 * Block → ref mapping (app-shaped, stays here):
 *   1. External block → `{ url: externalUrl }` — classified by the client
 *      (an expiring/signed URL is REFUSED and renders as unavailable).
 *   2. Matrx + public + TRUE permanent cdnUrl → `{ url: cdnUrl }` — the
 *      block-carried permanent URL wins without waiting for hydration.
 *   3. Matrx → `{ file_id }` — the client resolves the durable URL
 *      (`mx_files_session`-cookie-authenticated inline URL, or the record's
 *      permanent CDN URL once hydrated).
 *   4. Base64 (streaming partials) → data-URI placeholder while no
 *      resolvable identity exists yet.
 */

"use client";

import { useMemo } from "react";
import type { MediaRefLike } from "@ai-matrx/media";
import {
  useMediaLoadRecovery,
  useMediaResolution,
} from "@ai-matrx/media/core";
import { classifyMediaUrl } from "@/lib/media/durability";
import type { ImageBlock, VideoBlock } from "./types";

export type MediaSourceBlock = ImageBlock | VideoBlock;

/**
 * A `cdnUrl` is only "permanent" if it is NOT itself a LEGACY signed URL.
 * Old stored rows can carry an expiring signed URL in the `cdnUrl` slot;
 * treating that as permanent skips durable resolution and the media dies on
 * expiry — so we re-check here before shortcutting past the client.
 */
function isPermanentCdn(cdnUrl: string | null | undefined): cdnUrl is string {
  return !!cdnUrl && classifyMediaUrl(cdnUrl) !== "expiring";
}

export interface BlockMediaSourceResult {
  /** Best URL to render right now. null when nothing usable is available. */
  src: string | null;
  /** "ready" | "loading" | "error" (resolution is synchronous now). */
  status: "ready" | "loading" | "error";
  /** True when `src` is a base64 stand-in while the final block lands. */
  isPlaceholder: boolean;
  /** The fileId, if this is a matrx block. */
  fileId: string | null;
  /** Resolved poster/cover URL (video blocks), else null. */
  posterUrl: string | null;
  /** The durable ref the block resolved through (for lightbox/share/actions). */
  mediaRef: MediaRefLike | null;
  /**
   * Bumps after a successful client-verdict retry. Key the media element on
   * it so the browser re-requests the same durable URL with the fresh
   * `mx_files_session` cookie.
   */
  retryKey: number;
  /** Wire to the media element's `onError`. */
  onLoadError: (event?: unknown) => void;
  /** True once the client's retry contract is exhausted (terminal). */
  failed: boolean;
}

export function useBlockMediaSource(
  block: MediaSourceBlock | null,
): BlockMediaSourceResult {
  const mediaRef = useMemo<MediaRefLike | null>(() => {
    if (!block) return null;
    if (block.origin === "external") {
      if (!block.externalUrl) return null;
      return {
        url: block.externalUrl,
        mime_type: block.mimeType ?? undefined,
      };
    }
    if (block.visibility === "public" && isPermanentCdn(block.cdnUrl)) {
      return { url: block.cdnUrl, mime_type: block.mimeType ?? undefined };
    }
    return { file_id: block.fileId, mime_type: block.mimeType ?? undefined };
  }, [block]);

  const { resolution, status: resolutionStatus } = useMediaResolution(mediaRef);

  const resolved = useMemo<{
    src: string | null;
    status: "ready" | "loading" | "error";
    isPlaceholder: boolean;
  }>(() => {
    if (!block) return { src: null, status: "loading", isPlaceholder: false };

    if (resolution) {
      return { src: resolution.src, status: "ready", isPlaceholder: false };
    }

    // Streaming partials: no resolvable identity yet, but inline base64.
    if (block.base64) {
      return {
        src: toDataUri(block.base64, block.mimeType, block.kind),
        status: block.status === "streaming" ? "loading" : "ready",
        isPlaceholder: true,
      };
    }

    // `unavailable` = the client REFUSED the ref (signed URL — law 3) or
    // classified a typed unavailable state. Render as error, never rethrow.
    if (resolutionStatus === "unavailable") {
      return { src: null, status: "error", isPlaceholder: false };
    }

    // Empty ref with nothing inline to show.
    return { src: null, status: "error", isPlaceholder: false };
  }, [block, resolution, resolutionStatus]);

  // The ONE retry contract (session refresh → same-URL retry → terminal)
  // lives behind `MediaClient.recoverLoadError`. Placeholder data URIs and
  // foreign URLs come through `recoverable: false` and fail straight.
  const recovery = useMediaLoadRecovery(
    resolution ? resolution.src : null,
    { recoverable: resolution?.recoverable },
  );

  return {
    ...resolved,
    fileId: block?.origin === "matrx" ? block.fileId : null,
    posterUrl:
      block && block.kind === "video" ? (block.posterUrl ?? null) : null,
    mediaRef,
    retryKey: recovery.retryKey,
    onLoadError: recovery.onLoadError,
    failed: recovery.failed,
  };
}

function toDataUri(
  base64: string,
  mime: string | null,
  kind: "image" | "video",
): string {
  // Some Python paths pass the raw bytes; others pass an already-prefixed
  // data URI. Detect and dedupe.
  if (base64.startsWith("data:")) return base64;
  const fallback = kind === "video" ? "video/mp4" : "image/png";
  return `data:${mime ?? fallback};base64,${base64}`;
}
