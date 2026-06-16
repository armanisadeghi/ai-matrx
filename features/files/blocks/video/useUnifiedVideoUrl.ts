/**
 * features/files/blocks/video/useUnifiedVideoUrl.ts
 *
 * THE single hook that turns a `VideoBlock` into the URL the browser
 * should render right now. Mirrors `image/useUnifiedImageUrl.ts` exactly —
 * same signed-URL expiry / refresh / access-check strategy — so video and
 * image resolution stay one mental model.
 *
 * Strategy (priority order):
 *   1. External block → return `externalUrl` immediately. Done.
 *   2. Matrx + public + cdnUrl → return `cdnUrl`. Permanent URL.
 *   3. Matrx + base64 (streaming) → data URI placeholder while the final
 *      block lands.
 *   4. Matrx + valid signed URL → return `signedUrl` as-is.
 *   5. Matrx + expired/missing signed URL → ask the handler to resolve
 *      the file_id into a fresh URL.
 *
 * The handler's `useFileAs` does the heavy lifting (load cld_files once,
 * pick the right flavor, lazy in-memory cache). See the image twin for
 * the full reasoning.
 */

"use client";

import { useMemo } from "react";
import { useFileAs } from "@/features/files/handler/hooks/useFileAs";
import type { FileSource } from "@/features/files/handler/types";
import type { VideoBlock } from "../types";

const EXPIRY_SAFETY_MARGIN_MS = 30 * 1000;

export interface UseUnifiedVideoUrlResult {
  /** Best URL to render right now. null when nothing usable is available. */
  src: string | null;
  /** "ready" | "loading" | "refreshing" | "error" */
  status: "ready" | "loading" | "refreshing" | "error";
  /** True when `src` is a base64 stand-in while the real URL resolves. */
  isPlaceholder: boolean;
  /** The fileId, if this is a matrx block. */
  fileId: string | null;
  /** Resolved poster/cover URL, if present on the block. */
  posterUrl: string | null;
}

export function useUnifiedVideoUrl(
  block: VideoBlock | null,
): UseUnifiedVideoUrlResult {
  const needsHandlerResolution = useMemo(() => {
    if (!block) return false;
    if (block.origin === "external") return false;
    if (block.visibility === "public" && block.cdnUrl) return false;
    return true;
  }, [block]);

  const source: FileSource | null = useMemo(() => {
    if (!block || block.origin !== "matrx") return null;
    if (!needsHandlerResolution) return null;
    return { kind: "file_id", fileId: block.fileId };
  }, [block, needsHandlerResolution]);

  const { result: handlerUrl, status: handlerStatus } = useFileAs(source, {
    kind: "html_src",
  });

  return useMemo<UseUnifiedVideoUrlResult>(() => {
    if (!block) {
      return {
        src: null,
        status: "loading",
        isPlaceholder: false,
        fileId: null,
        posterUrl: null,
      };
    }

    const posterUrl = block.posterUrl ?? null;

    // ── External ──────────────────────────────────────────────────────
    if (block.origin === "external") {
      if (block.externalUrl) {
        return {
          src: block.externalUrl,
          status: "ready",
          isPlaceholder: false,
          fileId: null,
          posterUrl,
        };
      }
      if (block.base64) {
        return {
          src: toDataUri(block.base64, block.mimeType),
          status: block.status === "streaming" ? "loading" : "ready",
          isPlaceholder: true,
          fileId: null,
          posterUrl,
        };
      }
      return {
        src: null,
        status: "error",
        isPlaceholder: false,
        fileId: null,
        posterUrl,
      };
    }

    // ── Matrx — public + cdnUrl: permanent ────────────────────────────
    if (block.visibility === "public" && block.cdnUrl) {
      return {
        src: block.cdnUrl,
        status: "ready",
        isPlaceholder: false,
        fileId: block.fileId,
        posterUrl,
      };
    }

    // ── Matrx — handler resolved a URL: prefer it ─────────────────────
    if (handlerUrl) {
      return {
        src: handlerUrl,
        status: "ready",
        isPlaceholder: false,
        fileId: block.fileId,
        posterUrl,
      };
    }

    // ── Matrx — handler resolving but a valid signed URL exists ───────
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
        posterUrl,
      };
    }

    // ── Matrx — fall back to cdnUrl even on non-public ────────────────
    if (block.cdnUrl) {
      return {
        src: block.cdnUrl,
        status: handlerStatus === "resolving" ? "refreshing" : "ready",
        isPlaceholder: false,
        fileId: block.fileId,
        posterUrl,
      };
    }

    // ── Matrx — placeholder: base64 (streaming partials) ──────────────
    if (block.base64) {
      return {
        src: toDataUri(block.base64, block.mimeType),
        status: handlerStatus === "resolving" ? "loading" : "ready",
        isPlaceholder: true,
        fileId: block.fileId,
        posterUrl,
      };
    }

    // ── Matrx — handler error or no usable source ─────────────────────
    if (handlerStatus === "error") {
      return {
        src: null,
        status: "error",
        isPlaceholder: false,
        fileId: block.fileId,
        posterUrl,
      };
    }

    return {
      src: null,
      status: "loading",
      isPlaceholder: false,
      fileId: block.fileId,
      posterUrl,
    };
  }, [block, handlerUrl, handlerStatus]);
}

function toDataUri(base64: string, mime: string | null): string {
  if (base64.startsWith("data:")) return base64;
  return `data:${mime ?? "video/mp4"};base64,${base64}`;
}
