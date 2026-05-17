/**
 * features/files/blocks/image/useUnifiedImageUrl.ts
 *
 * THE single hook that turns a `UnifiedImageBlock` into the URL the browser
 * should render right now. All signed-URL expiry, refresh, and access-check
 * logic lives here — components never deal with this themselves.
 *
 * Strategy (priority order):
 *   1. External block → return `externalUrl` immediately. Done.
 *   2. Matrx + public + cdnUrl → return `cdnUrl`. No refresh ever needed.
 *   3. Matrx + base64 (streaming) → return a data URI placeholder while
 *      we wait for the final block to land.
 *   4. Matrx + valid signed URL → return `signedUrl`. Register with the
 *      handler so the global expiry-wheel mints a fresh one before this
 *      one dies.
 *   5. Matrx + expired/missing signed URL → ask the handler to resolve
 *      the file_id into a fresh URL. Show base64 / thumbnail as a
 *      placeholder while resolving.
 *
 * The handler's `useFileAs` does the heavy lifting: it loads cld_files
 * metadata once, picks the right URL flavor (CDN for public, signed for
 * private), and re-mints signed URLs via the global expiry-wheel — one
 * timer for the whole app, not one per visible image.
 */

"use client";

import { useMemo } from "react";
import { useFileAs } from "@/features/files/handler/hooks/useFileAs";
import type { FileSource } from "@/features/files/handler/types";
import type { UnifiedImageBlock } from "./types";

const EXPIRY_SAFETY_MARGIN_MS = 30 * 1000;

export interface UseUnifiedImageUrlResult {
  /** Best URL to render right now. null when nothing usable is available. */
  src: string | null;
  /** "ready" | "loading" | "refreshing" | "error" */
  status: "ready" | "loading" | "refreshing" | "error";
  /**
   * True when `src` is base64 / thumbnail (i.e. a stand-in while the real
   * URL is being resolved). Renderers may show a subtle placeholder badge.
   */
  isPlaceholder: boolean;
  /**
   * The fileId, if this is a matrx block. Useful for action-bar items
   * that operate on the underlying file (share, visibility change).
   */
  fileId: string | null;
}

export function useUnifiedImageUrl(
  block: UnifiedImageBlock | null,
): UseUnifiedImageUrlResult {
  // Decide whether we need to ask the handler to resolve. Public matrx
  // blocks with a cdnUrl never need the handler — the URL is permanent.
  const needsHandlerResolution = useMemo(() => {
    if (!block) return false;
    if (block.origin === "external") return false;
    if (block.visibility === "public" && block.cdnUrl) return false;
    // Trust a non-expired signed URL for the initial render; the handler
    // call still runs in the background to register expiry refresh.
    return true;
  }, [block]);

  // Build a file_id source for the handler. When the block isn't matrx or
  // doesn't need resolution, we pass null and useFileAs becomes a no-op.
  const source: FileSource | null = useMemo(() => {
    if (!block || block.origin !== "matrx") return null;
    if (!needsHandlerResolution) return null;
    return { kind: "file_id", fileId: block.fileId };
  }, [block, needsHandlerResolution]);

  const { result: handlerUrl, status: handlerStatus } = useFileAs(source, {
    kind: "html_src",
  });

  return useMemo<UseUnifiedImageUrlResult>(() => {
    if (!block) {
      return {
        src: null,
        status: "loading",
        isPlaceholder: false,
        fileId: null,
      };
    }

    // ── External ─────────────────────────────────────────────────────────
    if (block.origin === "external") {
      if (block.externalUrl) {
        return {
          src: block.externalUrl,
          status: "ready",
          isPlaceholder: false,
          fileId: null,
        };
      }
      // Streaming partial — base64 only
      if (block.base64) {
        return {
          src: toDataUri(block.base64, block.mimeType),
          status: block.status === "streaming" ? "loading" : "ready",
          isPlaceholder: true,
          fileId: null,
        };
      }
      return {
        src: null,
        status: "error",
        isPlaceholder: false,
        fileId: null,
      };
    }

    // ── Matrx — public + cdnUrl: permanent, no expiry plumbing ──────────
    if (block.visibility === "public" && block.cdnUrl) {
      return {
        src: block.cdnUrl,
        status: "ready",
        isPlaceholder: false,
        fileId: block.fileId,
      };
    }

    // ── Matrx — handler has resolved a URL: prefer it (canonical) ───────
    if (handlerUrl) {
      return {
        src: handlerUrl,
        status: "ready",
        isPlaceholder: false,
        fileId: block.fileId,
      };
    }

    // ── Matrx — handler still resolving but we have a valid signed URL ──
    const signedStillValid =
      block.signedUrl &&
      (block.signedUrlExpiresAt === null ||
        block.signedUrlExpiresAt > Date.now() + EXPIRY_SAFETY_MARGIN_MS);
    if (signedStillValid && block.signedUrl) {
      return {
        src: block.signedUrl,
        status: handlerStatus === "resolving" ? "refreshing" : "ready",
        isPlaceholder: false,
        fileId: block.fileId,
      };
    }

    // ── Matrx — fall back to cdnUrl even on non-public when present ─────
    if (block.cdnUrl) {
      return {
        src: block.cdnUrl,
        status: handlerStatus === "resolving" ? "refreshing" : "ready",
        isPlaceholder: false,
        fileId: block.fileId,
      };
    }

    // ── Matrx — placeholder: base64 (streaming partials) ───────────────
    // Phase 1b: `block.thumbnailUrl` is no longer carried on the block —
    // thumbnails live on `Asset.variants["thumbnail_url"]` and surface
    // through `MediaThumbnail` (driven by `CloudFile.thumbnailUrl`),
    // not through the image renderer's URL pipeline.
    if (block.base64) {
      return {
        src: toDataUri(block.base64, block.mimeType),
        status: handlerStatus === "resolving" ? "loading" : "ready",
        isPlaceholder: true,
        fileId: block.fileId,
      };
    }

    // ── Matrx — handler error or no usable source ──────────────────────
    if (handlerStatus === "error") {
      return {
        src: null,
        status: "error",
        isPlaceholder: false,
        fileId: block.fileId,
      };
    }

    // Resolution still in flight, nothing to show yet.
    return {
      src: null,
      status: "loading",
      isPlaceholder: false,
      fileId: block.fileId,
    };
  }, [block, handlerUrl, handlerStatus]);
}

function toDataUri(base64: string, mime: string | null): string {
  // Some Python paths pass the raw bytes; others pass an already-prefixed
  // data URI. Detect and dedupe.
  if (base64.startsWith("data:")) return base64;
  return `data:${mime ?? "image/png"};base64,${base64}`;
}
