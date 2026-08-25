"use client";

/**
 * Resolve a cloud-files PDF to the URL PDF.js should read.
 *
 * Cold files use the canonical CDN / signed-inline URL from the Asset
 * envelope. PDF.js can issue HTTP Range requests against that object URL, so
 * page one paints without waiting for the entire file. This is especially
 * important for large PDFs and Office-to-PDF preview derivatives.
 *
 * If the complete blob is already in the in-memory file cache, keep using it:
 * that path is instant and avoids a network request. We deliberately do not
 * hydrate IndexedDB or start a full download here; doing either before
 * returning a URL would recreate the full-file first-paint gate this hook is
 * responsible for preventing.
 */

import { useEffect } from "react";
import { getCached, invalidate } from "@/features/files/hooks/blob-cache";
import { useFileAsset } from "@/features/files/hooks/useFileAsset";

export interface UsePdfRemoteSourceResult {
  /** A direct HTTP(S) object URL or an already-warm blob URL. */
  remoteUrl: string | null;
  /** Direct signed/CDN URLs do not need caller-supplied auth headers. */
  headers: Record<string, string>;
  /** True while the small Asset envelope is being resolved. */
  loading: boolean;
  /** Asset-resolution error, or `null`. */
  error: string | null;
  /** True when the backing file no longer exists. */
  sourceMissing: boolean;
  /** No eager byte transfer occurs on the progressive path. */
  bytesLoaded: number;
  /** Bytes known to be locally ready (warm blobs only). */
  bytesTotal: number | null;
  /** Drop a suspect warm blob and mint a fresh direct URL. */
  retry: () => void;
}

const MISSING_RE =
  /not.?found|\b404\b|\b410\b|no longer|been deleted|unavailable|does not exist/i;

export function usePdfRemoteSource(
  fileId: string | null,
): UsePdfRemoteSourceResult {
  const cached = fileId ? getCached(fileId) : null;
  const { asset, isLoading, error, refresh } = useFileAsset(fileId, {
    signedUrlTtl: 3600,
    enabled: !!fileId && !cached,
  });

  const original = asset?.variants?.original;
  const directUrl =
    original?.cdn_url ??
    original?.signed_url ??
    original?.url ??
    asset?.primary_url ??
    null;
  const sourceMissing = !!error && MISSING_RE.test(error);

  const retry = () => {
    if (fileId) invalidate(fileId);
    void refresh();
  };

  useEffect(() => {
    if (!fileId) return;
    if (cached) {
      // eslint-disable-next-line no-console
      console.info(
        `[pdf-load] warm blob ready — ${fileId} (${cached.bytes} bytes)`,
      );
    } else if (directUrl) {
      // Never log the signed URL. Its presence proves the progressive edge is
      // armed; the durable id is enough to correlate a failure.
      // eslint-disable-next-line no-console
      console.info(`[pdf-load] range source ready — ${fileId}`);
    } else if (error) {
      // eslint-disable-next-line no-console
      console.warn(`[pdf-load] source failed — ${fileId}: ${error}`);
    }
  }, [cached, directUrl, error, fileId]);

  return {
    remoteUrl: cached?.url ?? directUrl,
    headers: {},
    loading: !!fileId && !cached && isLoading,
    error: sourceMissing ? null : error,
    sourceMissing,
    bytesLoaded: cached?.bytes ?? 0,
    bytesTotal: cached?.bytes ?? null,
    retry,
  };
}
