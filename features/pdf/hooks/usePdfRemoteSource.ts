"use client";

/**
 * features/pdf/hooks/usePdfRemoteSource.ts
 *
 * Resolve a cloud-files PDF (by `fileId`) to a source pdfjs can render.
 *
 * 2026-06-13 — REWRITTEN to fix the caching + reliability disaster.
 * ─────────────────────────────────────────────────────────────────
 * The previous version handed pdfjs a *network* URL (`/files/{id}/download`)
 * and let it Range-fetch progressively. That sounded clever but was broken:
 *
 *   1. NO CACHING. The blob-cache Service Worker is READ-ONLY for that path
 *      — nothing ever populated it from pdfjs Range fetches (see `sw.ts`
 *      handleFetch: on a miss it `fetch()`es but never stores). So every
 *      view re-hit the network. The same PDF rendered twice on one page
 *      downloaded twice. Cross-page, cross-tab — never cached. (Backend
 *      also sends `Cache-Control: private, max-age=0`, so the browser HTTP
 *      cache didn't save it either.)
 *   2. UNRELIABLE. pdfjs uses `fetch` with an Authorization header → a
 *      *preflighted* CORS request. CDN-hosted (public) files 302-redirect
 *      cross-origin, and browsers refuse to follow a cross-origin redirect
 *      of a preflighted request → silent "Failed to fetch". And a cold
 *      backend / SW miss could hang with no error → "Preparing document…"
 *      forever.
 *
 * THE FIX: route through the canonical cached byte path — `useFileBlob`
 * (XMLHttpRequest, which handles the CDN redirect correctly; module-level
 * LRU cache + IndexedDB; real download progress). We hand pdfjs a `blob:`
 * URL, which is:
 *   - INSTANT on every re-open (same page, other page, after a reload via
 *     IDB) — the bytes are already in memory.
 *   - BULLETPROOF — no CORS, no redirect, no Range-streaming SW dance, no
 *     auth header. pdfjs reads it straight from memory.
 *
 * Tradeoff: the first view downloads the whole file before page 1 paints
 * (no progressive first-paint). For real-world docs (a few MB) that's a
 * blink, and it's cached forever after. Correctness + caching beats a
 * progressive first-paint that never cached.
 */

import { useEffect } from "react";
import { useFileBlob } from "@/features/files/hooks/useFileBlob";

export interface UsePdfRemoteSourceResult {
  /** A `blob:` URL pdfjs renders from memory. `null` until bytes are ready. */
  remoteUrl: string | null;
  /** Always `{}` for a `blob:` URL — kept for the renderer's prop shape. */
  headers: Record<string, string>;
  /** True until the bytes are resolved (cache hit = false immediately). */
  loading: boolean;
  /** Surfaced load error (network / decode), or `null`. */
  error: string | null;
  /** True when the backing file's bytes are gone (deleted / 404). */
  sourceMissing: boolean;
  /** Bytes downloaded so far during an active fetch (0 on a cache hit). */
  bytesLoaded: number;
  /** Total bytes when known. */
  bytesTotal: number | null;
  /** Drop the cached bytes and re-fetch from the network. */
  retry: () => void;
}

const MISSING_RE =
  /not.?found|\b404\b|\b410\b|no longer|been deleted|unavailable|does not exist/i;

export function usePdfRemoteSource(
  fileId: string | null,
): UsePdfRemoteSourceResult {
  const { url, loading, error, bytesLoaded, bytesTotal, retry } =
    useFileBlob(fileId);

  // A 404 / not-found / deleted error means the original binary is gone —
  // the caller should render the graceful "source unavailable" panel rather
  // than a scary error card.
  const sourceMissing = !!error && MISSING_RE.test(error);

  // Lightweight, PDF-scoped console visibility (the user asked to SEE what's
  // happening on every load). One line per resolution, with timing.
  useEffect(() => {
    if (!fileId) return undefined;
    const startedAt =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    // eslint-disable-next-line no-console
    console.info(`[pdf-load] ▶ resolving bytes — ${fileId}`);
    return () => {
      const now =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      // eslint-disable-next-line no-console
      console.info(
        `[pdf-load] ◼ unmounted ${fileId} after ${Math.round(now - startedAt)}ms`,
      );
    };
  }, [fileId]);

  useEffect(() => {
    if (!fileId) return;
    if (url) {
      // eslint-disable-next-line no-console
      console.info(
        `[pdf-load] ✓ bytes ready — ${fileId}` +
          (bytesTotal ? ` (${(bytesTotal / 1024).toFixed(0)} KB)` : ""),
      );
    } else if (error) {
      // eslint-disable-next-line no-console
      console.warn(`[pdf-load] ✗ bytes failed — ${fileId}: ${error}`);
    }
  }, [url, error, bytesTotal, fileId]);

  return {
    remoteUrl: url,
    headers: {},
    loading,
    error: sourceMissing ? null : error,
    sourceMissing,
    bytesLoaded,
    bytesTotal,
    retry,
  };
}
