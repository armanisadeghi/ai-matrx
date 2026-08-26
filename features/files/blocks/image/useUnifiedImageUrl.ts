/**
 * features/files/blocks/image/useUnifiedImageUrl.ts
 *
 * THE single hook that turns a `UnifiedImageBlock` into the URL the browser
 * should render right now. URL resolution is durable and synchronous —
 * components never deal with expiry because durable URLs have none.
 *
 * Strategy (priority order):
 *   1. External block → return `externalUrl` immediately. Done.
 *   2. Matrx + public + cdnUrl → return `cdnUrl`. Permanent URL.
 *   3. Matrx → handler-resolved durable URL via `useFileAs(html_src)`
 *      (`{base}/files/{id}/download?inline=1` — authenticated by the
 *      `mx_files_session` cookie for private files).
 *   4. Matrx + base64 (streaming) → data URI placeholder while the final
 *      block lands.
 *
 * Error recovery is session refresh, not URL re-mint: `reportLoadError`
 * forces `ensureFilesSession({ force: true })` once and bumps `retryNonce`
 * so the renderer re-requests the SAME durable URL with a fresh cookie.
 */

"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useFileAs } from "@/features/files/handler/hooks/useFileAs";
import { ensureFilesSession } from "@/features/files/handler/session";
import { isSignedUrl } from "@/lib/media/signed-url";
import type { FileSource } from "@/features/files/handler/types";
import type { UnifiedImageBlock } from "./types";

/**
 * A `cdnUrl` is only "permanent" if it is NOT itself a LEGACY signed URL. Old
 * stored rows can carry an expiring signed URL in the `cdnUrl` slot; treating
 * that as permanent skips the durable-resolution path and the image dies on
 * expiry. For an owned file that must never happen — so we re-check here.
 */
function isPermanentCdn(cdnUrl: string | null | undefined): cdnUrl is string {
  return !!cdnUrl && !isSignedUrl(cdnUrl);
}

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
  /**
   * Bumps after a successful session-refresh recovery. Key the media element
   * on it so the browser re-requests the same durable URL with the fresh
   * `mx_files_session` cookie.
   */
  retryNonce: number;
  /**
   * Call from the renderer's `<img onError>`. For an OWNED file (matrx +
   * fileId) this refreshes the file-session cookie and retries the SAME
   * durable URL once. Resolves `true` when a retry was triggered (the caller
   * should NOT show a terminal error — the element remounts via
   * `retryNonce`), or `false` when there is nothing more we can do.
   */
  reportLoadError: (failedSrc: string | null) => Promise<boolean>;
}

export function useUnifiedImageUrl(
  block: UnifiedImageBlock | null,
): UseUnifiedImageUrlResult {
  const [retryNonce, setRetryNonce] = useState(0);
  const retried = useRef(false);

  const blockFileId = block?.origin === "matrx" ? block.fileId : null;

  // Reset the retry budget whenever the underlying file changes so a new
  // image in the same renderer instance starts fresh.
  const lastFileIdRef = useRef(blockFileId);
  if (lastFileIdRef.current !== blockFileId) {
    lastFileIdRef.current = blockFileId;
    retried.current = false;
  }

  // Decide whether we need to ask the handler to resolve. Public matrx
  // blocks with a TRUE permanent CDN url never need the handler.
  const needsHandlerResolution = useMemo(() => {
    if (!block) return false;
    if (block.origin === "external") return false;
    if (block.visibility === "public" && isPermanentCdn(block.cdnUrl))
      return false;
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

  const reportLoadError = useCallback(
    async (failedSrc: string | null): Promise<boolean> => {
      if (!blockFileId) return false; // not an owned file — caller errors out
      if (retried.current) return false;
      retried.current = true;
      // LOUD recovery: a recovery firing means the session cookie was
      // missing/stale — surface it so a systemic auth problem can't hide.
      console.warn(
        "[file-handler] owned image URL failed to load — refreshing the " +
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
    Omit<UseUnifiedImageUrlResult, "reportLoadError" | "retryNonce">
  >(() => {
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

    // ── Matrx — public + TRUE permanent CDN url: served straight ────────
    if (block.visibility === "public" && isPermanentCdn(block.cdnUrl)) {
      return {
        src: block.cdnUrl,
        status: "ready",
        isPlaceholder: false,
        fileId: block.fileId,
      };
    }

    // ── Matrx — handler has resolved the durable URL: canonical ─────────
    if (handlerUrl) {
      return {
        src: handlerUrl,
        status: "ready",
        isPlaceholder: false,
        fileId: block.fileId,
      };
    }

    // ── Matrx — fall back to a TRUE permanent cdnUrl even on non-public ──
    if (isPermanentCdn(block.cdnUrl)) {
      return {
        src: block.cdnUrl,
        status: handlerStatus === "resolving" ? "refreshing" : "ready",
        isPlaceholder: false,
        fileId: block.fileId,
      };
    }

    // ── Matrx — placeholder: base64 (streaming partials) ───────────────
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

  return useMemo<UseUnifiedImageUrlResult>(
    () => ({ ...resolved, retryNonce, reportLoadError }),
    [resolved, retryNonce, reportLoadError],
  );
}

function toDataUri(base64: string, mime: string | null): string {
  // Some Python paths pass the raw bytes; others pass an already-prefixed
  // data URI. Detect and dedupe.
  if (base64.startsWith("data:")) return base64;
  return `data:${mime ?? "image/png"};base64,${base64}`;
}
