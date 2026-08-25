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

import { useCallback } from "react";
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
  /** Original PDF size from the Asset envelope, when known. */
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

  const retry = useCallback(() => {
    if (fileId) invalidate(fileId);
    void refresh();
  }, [fileId, refresh]);

  return {
    remoteUrl: cached?.url ?? directUrl,
    headers: {},
    loading: !!fileId && !cached && isLoading,
    error: sourceMissing ? null : error,
    sourceMissing,
    bytesLoaded: cached?.bytes ?? 0,
    bytesTotal:
      cached?.bytes ?? original?.size_bytes ?? original?.file_size ?? null,
    retry,
  };
}
