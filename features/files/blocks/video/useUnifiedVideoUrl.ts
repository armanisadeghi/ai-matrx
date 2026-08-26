/**
 * features/files/blocks/video/useUnifiedVideoUrl.ts
 *
 * THE single hook that turns a `VideoBlock` into the URL the browser
 * should render right now. Mirrors `image/useUnifiedImageUrl.ts` exactly —
 * same durable-URL resolution + session-refresh recovery — so video and
 * image resolution stay one mental model.
 *
 * Strategy (priority order):
 *   1. External block → return `externalUrl` immediately. Done.
 *   2. Matrx + public + cdnUrl → return `cdnUrl`. Permanent URL.
 *   3. Matrx → handler-resolved durable URL via `useFileAs(html_src)`.
 *   4. Matrx + base64 (streaming) → data URI placeholder while the final
 *      block lands.
 *
 * Error recovery is session refresh, not URL re-mint — see the image twin.
 */

"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useFileAs } from "@/features/files/handler/hooks/useFileAs";
import { ensureFilesSession } from "@/features/files/handler/session";
import { isSignedUrl } from "@/lib/media/signed-url";
import type { FileSource } from "@/features/files/handler/types";
import type { VideoBlock } from "../types";

/** A `cdnUrl` is only permanent if it is NOT itself a LEGACY signed URL. */
function isPermanentCdn(cdnUrl: string | null | undefined): cdnUrl is string {
  return !!cdnUrl && !isSignedUrl(cdnUrl);
}

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
  /**
   * Bumps after a successful session-refresh recovery. Key the media element
   * on it so the browser re-requests the same durable URL.
   */
  retryNonce: number;
  /**
   * Call from the renderer's `<video onError>`. For an OWNED file this
   * refreshes the file-session cookie and retries the SAME durable URL once.
   * Resolves `true` when a retry was triggered, `false` otherwise.
   */
  reportLoadError: (failedSrc: string | null) => Promise<boolean>;
}

export function useUnifiedVideoUrl(
  block: VideoBlock | null,
): UseUnifiedVideoUrlResult {
  const [retryNonce, setRetryNonce] = useState(0);
  const retried = useRef(false);

  const blockFileId = block?.origin === "matrx" ? block.fileId : null;

  const lastFileIdRef = useRef(blockFileId);
  if (lastFileIdRef.current !== blockFileId) {
    lastFileIdRef.current = blockFileId;
    retried.current = false;
  }

  const needsHandlerResolution = useMemo(() => {
    if (!block) return false;
    if (block.origin === "external") return false;
    if (block.visibility === "public" && isPermanentCdn(block.cdnUrl))
      return false;
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

  const reportLoadError = useCallback(
    async (failedSrc: string | null): Promise<boolean> => {
      if (!blockFileId) return false;
      if (retried.current) return false;
      retried.current = true;
      console.warn(
        "[file-handler] owned video URL failed to load — refreshing the " +
          "file session and retrying the same durable URL. " +
          `fileId=${blockFileId} failedSrc=${String(failedSrc).slice(0, 120)}`,
      );
      try {
        await ensureFilesSession({ force: true });
        setRetryNonce((n) => n + 1);
        return true;
      } catch (err) {
        console.error(
          `[file-handler] session refresh FAILED for owned file ${blockFileId}`,
          err,
        );
        return false;
      }
    },
    [blockFileId],
  );

  const resolved = useMemo<
    Omit<UseUnifiedVideoUrlResult, "reportLoadError" | "retryNonce">
  >(() => {
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

    // ── Matrx — public + TRUE permanent CDN url ───────────────────────
    if (block.visibility === "public" && isPermanentCdn(block.cdnUrl)) {
      return {
        src: block.cdnUrl,
        status: "ready",
        isPlaceholder: false,
        fileId: block.fileId,
        posterUrl,
      };
    }

    // ── Matrx — handler resolved the durable URL: canonical ───────────
    if (handlerUrl) {
      return {
        src: handlerUrl,
        status: "ready",
        isPlaceholder: false,
        fileId: block.fileId,
        posterUrl,
      };
    }

    // ── Matrx — fall back to a TRUE permanent cdnUrl even on non-public ─
    if (isPermanentCdn(block.cdnUrl)) {
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

  return useMemo<UseUnifiedVideoUrlResult>(
    () => ({ ...resolved, retryNonce, reportLoadError }),
    [resolved, retryNonce, reportLoadError],
  );
}

function toDataUri(base64: string, mime: string | null): string {
  if (base64.startsWith("data:")) return base64;
  return `data:${mime ?? "video/mp4"};base64,${base64}`;
}
