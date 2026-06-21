/**
 * features/files/blocks/image/useUnifiedImageUrl.ts
 *
 * THE single hook that turns a `UnifiedImageBlock` into the URL the browser
 * should render right now. All signed-URL expiry, refresh, and access-check
 * logic lives here — components never deal with this themselves.
 *
 * Strategy (priority order):
 *   1. External block → return `externalUrl` immediately. Done.
 *   2. Matrx + public + cdnUrl → return `cdnUrl`. Permanent URL.
 *   3. Matrx + base64 (streaming) → return a data URI placeholder while
 *      we wait for the final block to land.
 *   4. Matrx + valid signed URL → return `signedUrl` as-is. The browser
 *      keeps the image rendered from its HTTP cache even after the URL
 *      expires — no proactive refresh.
 *   5. Matrx + expired/missing signed URL → ask the handler to resolve
 *      the file_id into a fresh URL. Show base64 / thumbnail as a
 *      placeholder while resolving.
 *
 * The handler's `useFileAs` does the heavy lifting: it loads cld_files
 * metadata once, picks the right URL flavor (CDN for public, signed for
 * private), and uses a lazy in-memory cache for signed URLs — multiple
 * consumers of the same file share one URL and one network call.
 */

"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useFileAs } from "@/features/files/handler/hooks/useFileAs";
import {
  getOrMintSignedUrl,
  invalidateSignedUrl,
} from "@/features/files/handler/intelligence/signed-url-cache";
import { isSignedUrl } from "@/lib/media/signed-url";
import type { FileSource } from "@/features/files/handler/types";
import type { UnifiedImageBlock } from "./types";

const EXPIRY_SAFETY_MARGIN_MS = 30 * 1000;

/**
 * A `cdnUrl` is only "permanent" if it is NOT itself a signed URL. The backend
 * (and some adapters) can mistakenly file an expiring signed URL into the
 * `cdnUrl` slot; treating that as permanent skips the re-mint path and the image
 * dies on expiry. For an owned file that must never happen — so we re-check here.
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
   * Call from the renderer's `<img onError>`. For an OWNED file (matrx +
   * fileId) this invalidates the cached signed URL and re-mints a fresh one —
   * because a user's own file URL expiring is a non-event, not an error. The
   * returned promise resolves `true` when a re-mint was triggered (the caller
   * should NOT show a terminal error and instead wait for the new `src`), or
   * `false` when there is nothing more we can do (not ours, or re-mint failed).
   */
  reportLoadError: (failedSrc: string | null) => Promise<boolean>;
}

const MAX_REMINT_ATTEMPTS = 2;

export function useUnifiedImageUrl(
  block: UnifiedImageBlock | null,
): UseUnifiedImageUrlResult {
  // A freshly re-minted URL, set by `reportLoadError` after an owned file's
  // served URL failed to load. Overrides the resolved `src` so the same <img>
  // retries with a guaranteed-fresh signature.
  const [override, setOverride] = useState<{
    fileId: string;
    url: string;
  } | null>(null);
  const remintAttempts = useRef(0);

  const blockFileId = block?.origin === "matrx" ? block.fileId : null;

  // Reset the re-mint budget whenever the underlying file changes so a new
  // image in the same renderer instance starts fresh.
  const lastFileIdRef = useRef(blockFileId);
  if (lastFileIdRef.current !== blockFileId) {
    lastFileIdRef.current = blockFileId;
    remintAttempts.current = 0;
  }

  // Decide whether we need to ask the handler to resolve. Public matrx
  // blocks with a TRUE permanent CDN url never need the handler. A signed url
  // sitting in the cdn slot is NOT permanent — fall through to minting.
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

  // The override only applies to the current file; reset when the file changes.
  const activeOverrideUrl =
    override && override.fileId === blockFileId ? override.url : null;

  const reportLoadError = useCallback(
    async (failedSrc: string | null): Promise<boolean> => {
      if (!blockFileId) return false; // not an owned file — caller errors out
      if (remintAttempts.current >= MAX_REMINT_ATTEMPTS) return false;
      remintAttempts.current += 1;
      // LOUD recovery: a recovery firing means a real bug got past the
      // proactive classification — surface it so it can't hide.
      console.warn(
        "[file-handler] owned image URL failed to load — re-minting from " +
          "file_id (a user's own file never just 'expires'). " +
          `fileId=${blockFileId} attempt=${remintAttempts.current} ` +
          `failedSrc=${String(failedSrc).slice(0, 120)}`,
      );
      invalidateSignedUrl(blockFileId);
      try {
        const fresh = await getOrMintSignedUrl(blockFileId);
        setOverride({ fileId: blockFileId, url: fresh.url });
        return true;
      } catch (err) {
        console.error(
          `[file-handler] re-mint FAILED for owned file ${blockFileId}`,
          err,
        );
        return false;
      }
    },
    [blockFileId],
  );

  const resolved = useMemo<
    Omit<UseUnifiedImageUrlResult, "reportLoadError">
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

    // ── Matrx — re-minted override wins: a fresh URL from reportLoadError ──
    if (activeOverrideUrl) {
      return {
        src: activeOverrideUrl,
        status: "ready",
        isPlaceholder: false,
        fileId: block.fileId,
      };
    }

    // ── Matrx — public + TRUE permanent CDN url: no expiry plumbing ─────
    if (block.visibility === "public" && isPermanentCdn(block.cdnUrl)) {
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

    // ── Matrx — handler still resolving but we have a PROVABLY-fresh
    // signed URL. We only serve a signed URL whose expiry is known AND in
    // the future. An unknown expiry (null) is NOT trusted — for an owned
    // file we'd rather wait for the mint than render a URL that may be dead.
    const signedStillValid =
      !!block.signedUrl &&
      block.signedUrlExpiresAt !== null &&
      block.signedUrlExpiresAt > Date.now() + EXPIRY_SAFETY_MARGIN_MS;
    if (signedStillValid && block.signedUrl) {
      return {
        src: block.signedUrl,
        status: handlerStatus === "resolving" ? "refreshing" : "ready",
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
  }, [block, handlerUrl, handlerStatus, activeOverrideUrl]);

  return useMemo<UseUnifiedImageUrlResult>(
    () => ({ ...resolved, reportLoadError }),
    [resolved, reportLoadError],
  );
}

function toDataUri(base64: string, mime: string | null): string {
  // Some Python paths pass the raw bytes; others pass an already-prefixed
  // data URI. Detect and dedupe.
  if (base64.startsWith("data:")) return base64;
  return `data:${mime ?? "image/png"};base64,${base64}`;
}
