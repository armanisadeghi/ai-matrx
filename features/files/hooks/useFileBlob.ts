/**
 * features/files/hooks/useFileBlob.ts
 *
 * Fetch a file's bytes via the Python `GET /files/{id}/download` endpoint
 * and return a `blob:` URL that any browser API (`<img>`, react-pdf,
 * `fetch`, etc.) can consume without triggering CORS.
 *
 * Why this exists
 * ───────────────
 * The cloud-files signed-URL endpoint (`GET /files/{id}/url`) returns a
 * direct S3 presigned URL. That URL works for HTML elements that don't
 * trigger CORS (`<img>`, `<video>`, `<audio>`, `<iframe>`, anchor
 * navigation), but `fetch(signedUrl)` ALWAYS triggers a CORS preflight.
 * If the S3 bucket isn't configured to allow our origin, the fetch
 * fails with a 403 — which is exactly what was breaking PDF / Markdown
 * / CSV / TXT previews.
 *
 * The Python `/files/{id}/download` endpoint streams the bytes through
 * FastAPI (which already has CORS configured for our origins). Routing
 * fetch-based previewers through it sidesteps the S3-CORS issue
 * entirely. Note: S3 bucket CORS was applied 2026-05-05 (Bundle B4) so
 * direct-`fetch` against signed URLs now works too — we keep this
 * same-origin proxy as the default for the cached-bytes ergonomics, but
 * callers can switch to direct fetch when latency matters.
 *
 * Caching
 * ───────
 * Blobs are cached at MODULE level via [./blob-cache](./blob-cache.ts) —
 * outside React state — so they survive component unmount / remount.
 * Closing the preview pane and reopening it is now instantaneous instead
 * of re-downloading 10 MB of PDF for every open.
 *
 * The cache:
 *   - is keyed by `fileId`
 *   - is capped at 250 MB total via LRU eviction
 *   - owns each blob's object URL (revokes on eviction or explicit
 *     `invalidate(fileId)`)
 *   - is invalidated by upload / restore-version / delete thunks +
 *     realtime cross-device version inserts (see
 *     `features/files/redux/thunks.ts` and `redux/realtime-middleware.ts`).
 */

"use client";

import { useEffect, useRef, useState } from "react";
import * as Files from "@/features/files/api/files";
import { extractErrorMessage } from "@/utils/errors";
import { getCached, hydrateFromIdb, setCached } from "./blob-cache";

export interface UseFileBlobResult {
  /** `blob:`-scheme URL safe to feed into any browser API. `null` until ready. */
  url: string | null;
  /** Underlying Blob — useful for callers that need the raw bytes. */
  blob: Blob | null;
  loading: boolean;
  /** Bytes received so far during the active fetch. 0 when not loading. */
  bytesLoaded: number;
  /** Total bytes when the server advertised Content-Length; null otherwise. */
  bytesTotal: number | null;
  error: string | null;
  /** Force a re-fetch (e.g. after auth refresh). Drops the cached entry. */
  retry: () => void;
}

export function useFileBlob(fileId: string | null): UseFileBlobResult {
  // Initialize from cache synchronously so the first render of a
  // re-opened file is already showing the blob — no `loading` flicker.
  const initialCached = fileId ? getCached(fileId) : null;
  const [url, setUrl] = useState<string | null>(initialCached?.url ?? null);
  const [blob, setBlob] = useState<Blob | null>(initialCached?.blob ?? null);
  const [loading, setLoading] = useState<boolean>(!!fileId && !initialCached);
  const [error, setError] = useState<string | null>(null);
  const [bytesLoaded, setBytesLoaded] = useState(
    initialCached ? initialCached.blob.size : 0,
  );
  const [bytesTotal, setBytesTotal] = useState<number | null>(
    initialCached ? initialCached.blob.size : null,
  );
  const [retryToken, setRetryToken] = useState(0);

  // Track the currently displayed cache key so the effect knows whether
  // an in-flight fetch is for a stale fileId.
  const activeFileIdRef = useRef<string | null>(fileId);
  activeFileIdRef.current = fileId;

  useEffect(() => {
    if (!fileId) {
      setUrl(null);
      setBlob(null);
      setLoading(false);
      setError(null);
      setBytesLoaded(0);
      setBytesTotal(null);
      return;
    }

    // Synthetic ids belong to virtual sources (Notes / Agent Apps / etc.).
    // They aren't real S3-backed bytes — `Files.downloadFileWithProgress`
    // would 404 against the Python backend. Callers should mount the
    // adapter's `inlinePreview` instead, or use `readAny` from
    // `redux/virtual-thunks.ts`. Surface a clear error rather than silently
    // failing.
    if (fileId.startsWith("vfs:")) {
      setUrl(null);
      setBlob(null);
      setLoading(false);
      setError(
        "useFileBlob can't load virtual files — use the adapter's inlinePreview or readAny instead.",
      );
      setBytesLoaded(0);
      setBytesTotal(null);
      return;
    }

    // 1. In-memory cache hit — show the cached blob immediately, no fetch.
    const cached = getCached(fileId);
    if (cached) {
      setUrl(cached.url);
      setBlob(cached.blob);
      setLoading(false);
      setError(null);
      setBytesLoaded(cached.blob.size);
      setBytesTotal(cached.blob.size);
      return;
    }

    // 2. Miss — try IDB before going to network. Async; show loading state
    // in the meantime so the consumer renders its skeleton.
    let cancelled = false;
    setLoading(true);
    setError(null);
    setBytesLoaded(0);
    setBytesTotal(null);
    setUrl(null);
    setBlob(null);

    (async () => {
      const idbHit = await hydrateFromIdb(fileId);
      if (cancelled) return;
      if (idbHit) {
        setUrl(idbHit.url);
        setBlob(idbHit.blob);
        setLoading(false);
        setBytesLoaded(idbHit.blob.size);
        setBytesTotal(idbHit.blob.size);
        return;
      }

      // 3. IDB miss — fetch with progress.
      try {
        const { blob: b } = await Files.downloadFileWithProgress(
          fileId,
          (ev) => {
            if (cancelled) return;
            setBytesLoaded(ev.loaded);
            if (ev.total !== null) setBytesTotal(ev.total);
          },
        );
        if (cancelled) return;
        const objectUrl = URL.createObjectURL(b);
        // Insert into both cache tiers. From now on the cache owns the URL —
        // do NOT revoke it on unmount; the cache will do it on eviction.
        setCached(fileId, b, objectUrl, { mimeType: b.type });
        setBlob(b);
        setUrl(objectUrl);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(extractErrorMessage(err) || "Failed to load file");
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      // Intentionally NOT revoking the URL — the cache owns it. On
      // remount with the same fileId we'll read directly from the
      // cache and skip the network entirely.
    };
  }, [fileId, retryToken]);

  return {
    url,
    blob,
    loading,
    bytesLoaded,
    bytesTotal,
    error,
    retry: () => {
      // A retry implies the cached bytes are bad / stale — drop them so
      // the next fetch goes to the network. (Inline import to avoid a
      // circular dep when blob-cache lives in the same dir.)
      if (fileId) {
        // Bypass the cache for this retry by invalidating first.
        // Doing the invalidation lazily here keeps the import surface
        // small at module load.
        import("./blob-cache").then(({ invalidate }) => invalidate(fileId));
      }
      setRetryToken((t) => t + 1);
    },
  };
}
