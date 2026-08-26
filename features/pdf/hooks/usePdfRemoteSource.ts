"use client";

/**
 * Resolve a cloud-files PDF to the URL PDF.js should read.
 *
 * Cold files use the canonical CDN / durable-inline URL from the Asset
 * envelope. PDF.js can issue HTTP Range requests against that URL, so
 * page one paints without waiting for the entire file. This is especially
 * important for large PDFs and Office-to-PDF preview derivatives.
 *
 * If the complete blob is already in the in-memory file cache, keep using it:
 * that path is instant and avoids a network request. We deliberately do not
 * hydrate IndexedDB or start a full download here; doing either before
 * returning a URL would recreate the full-file first-paint gate this hook is
 * responsible for preventing.
 */

import { useEffect, useState } from "react";
import { getCached, invalidate } from "@/features/files/hooks/blob-cache";
import { useFileAsset } from "@/features/files/hooks/useFileAsset";
import { ensureFilesSession } from "@/features/files/handler/session";

export interface UsePdfRemoteSourceResult {
  /** A direct HTTP(S) object URL or an already-warm blob URL. */
  remoteUrl: string | null;
  /** PDF byte auth never rides caller-supplied headers. */
  headers: Record<string, string>;
  /** Private durable URLs authenticate through the cross-origin cookie. */
  withCredentials: boolean;
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
  /** Drop a suspect warm blob, refresh auth, and retry the same durable URL. */
  retry: () => void;
}

const MISSING_RE =
  /not.?found|\b404\b|\b410\b|no longer|been deleted|unavailable|does not exist/i;

export function usePdfRemoteSource(
  fileId: string | null,
): UsePdfRemoteSourceResult {
  const cached = fileId ? getCached(fileId) : null;
  const { asset, isLoading, error, refresh } = useFileAsset(fileId, {
    enabled: !!fileId && !cached,
  });
  const [sessionReadyFileId, setSessionReadyFileId] = useState<string | null>(
    null,
  );

  const original = asset?.variants?.original;
  const publicUrl = original?.cdn_url ?? null;
  const durableUrl = original?.url ?? asset?.primary_url ?? null;
  const needsFilesSession = !!fileId && !cached && !publicUrl && !!durableUrl;
  const sourceMissing = !!error && MISSING_RE.test(error);

  const retry = () => {
    if (fileId) invalidate(fileId);
    if (needsFilesSession) {
      setSessionReadyFileId(null);
      void ensureFilesSession({ force: true }).then(() => {
        setSessionReadyFileId(fileId);
        void refresh();
      });
      return;
    }
    void refresh();
  };

  useEffect(() => {
    let active = true;
    if (!fileId || !needsFilesSession) {
      return () => {
        active = false;
      };
    }

    void ensureFilesSession().then(() => {
      if (active) setSessionReadyFileId(fileId);
    });
    return () => {
      active = false;
    };
  }, [fileId, needsFilesSession]);

  const directUrl = publicUrl ?? durableUrl;
  const sessionReady = !needsFilesSession || sessionReadyFileId === fileId;

  useEffect(() => {
    if (!fileId) return;
    if (cached) {
      console.info(
        `[pdf-load] warm blob ready — ${fileId} (${cached.bytes} bytes)`,
      );
    } else if (directUrl) {
      // Never log the URL. Its presence proves the progressive edge is armed;
      // the durable id is enough to correlate a failure.
      console.info(`[pdf-load] range source ready — ${fileId}`);
    } else if (error) {
      console.warn(`[pdf-load] source failed — ${fileId}: ${error}`);
    }
  }, [cached, directUrl, error, fileId]);

  return {
    remoteUrl: cached?.url ?? (sessionReady ? directUrl : null),
    headers: {},
    withCredentials: needsFilesSession,
    loading: !!fileId && !cached && (isLoading || !sessionReady),
    error: sourceMissing ? null : error,
    sourceMissing,
    bytesLoaded: cached?.bytes ?? 0,
    bytesTotal: cached?.bytes ?? null,
    retry,
  };
}
