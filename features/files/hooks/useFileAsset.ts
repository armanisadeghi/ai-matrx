/**
 * features/files/hooks/useFileAsset.ts
 *
 * Canonical "give me a URL to render this file" hook. Wraps the
 * `GET /files/{file_id}/asset` endpoint and exposes the resulting
 * {@link Asset} envelope plus the primary inline-renderable URL.
 *
 * Why this hook instead of {@link useFileSrc}: the asset endpoint
 * returns every preset variant in one shot (cover, OG, thumbnail,
 * favicons, etc.) AND it honours the same CDN-vs-signed routing rules
 * the rest of the system uses (public files get CDN URLs; private/shared
 * get signed-inline URLs). New renderers should default to this hook;
 * `useFileSrc` covers callers that only need the raw inline URL
 * for the original file.
 *
 * Lifecycle:
 *   - Re-fetches whenever `fileId` or `signedUrlTtl` changes.
 *   - Auto-refreshes 30s before the signed URL expires (matching the
 *     handler's expiry-wheel policy). Public/CDN URLs never expire so the
 *     refresh timer is skipped.
 *
 * Pattern: plain React state + effects — no TanStack Query in
 * `features/files/hooks/` yet.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getAssetForFile } from "@/features/files/api/assets";
import { extractErrorMessage } from "@/utils/errors";
import type { Asset } from "@/features/files/types";

const SAFETY_MARGIN_MS = 30 * 1000;

export interface UseFileAssetOptions {
  /** Signed-URL TTL in seconds. Default 3600. Server bounds to [60, 604800]. */
  signedUrlTtl?: number;
  /**
   * If false, the hook won't fetch — useful when the host component
   * isn't visible yet (collapsed tab, off-screen list row).
   */
  enabled?: boolean;
}

export interface UseFileAssetResult {
  asset: Asset | null;
  /**
   * Convenience accessor for `asset.primary_url`. Falls back to
   * `asset.variants.original?.url` when the primary variant is missing
   * a URL for any reason. `null` while loading / on error.
   */
  primaryUrl: string | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Best-effort expiry parser for signed AWS URLs. AWS S3 signed URLs
 * encode `X-Amz-Date` + `X-Amz-Expires` in the query string; we use
 * those when present so the refresh timer fires before the URL dies.
 *
 * Returns `Number.POSITIVE_INFINITY` for any URL we can't decode —
 * which is the correct fallback for permanent CDN URLs.
 */
function parseSignedExpiry(url: string | null | undefined): number {
  if (!url) return Number.POSITIVE_INFINITY;
  try {
    const u = new URL(url);
    const date = u.searchParams.get("X-Amz-Date");
    const expires = u.searchParams.get("X-Amz-Expires");
    if (!date || !expires) return Number.POSITIVE_INFINITY;
    // X-Amz-Date is `YYYYMMDDTHHMMSSZ`.
    const iso = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${date.slice(9, 11)}:${date.slice(11, 13)}:${date.slice(13, 15)}Z`;
    const startedAt = Date.parse(iso);
    const ttlMs = Number.parseInt(expires, 10) * 1000;
    if (!Number.isFinite(startedAt) || !Number.isFinite(ttlMs))
      return Number.POSITIVE_INFINITY;
    return startedAt + ttlMs;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export function useFileAsset(
  fileId: string | null | undefined,
  options: UseFileAssetOptions = {},
): UseFileAssetResult {
  const { signedUrlTtl = 3600, enabled = true } = options;
  const [asset, setAsset] = useState<Asset | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const expiresAtRef = useRef<number>(Number.POSITIVE_INFINITY);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchAsset = useCallback(async () => {
    if (!fileId || !enabled) return;
    setIsLoading(true);
    setError(null);
    try {
      const { data } = await getAssetForFile(fileId, {
        signed_url_ttl: signedUrlTtl,
      });
      setAsset(data);
      expiresAtRef.current = parseSignedExpiry(data.primary_url);
    } catch (err) {
      setError(extractErrorMessage(err));
      setAsset(null);
      expiresAtRef.current = Number.POSITIVE_INFINITY;
    } finally {
      setIsLoading(false);
    }
  }, [fileId, enabled, signedUrlTtl]);

  useEffect(() => {
    if (!fileId || !enabled) {
      setAsset(null);
      return;
    }
    void fetchAsset();
  }, [fileId, enabled, fetchAsset]);

  // Auto-refresh before the signed URL expires.
  useEffect(() => {
    if (!asset) return;
    const expiresAt = expiresAtRef.current;
    if (!Number.isFinite(expiresAt)) return;
    const msUntilExpiry = expiresAt - Date.now() - SAFETY_MARGIN_MS;
    if (msUntilExpiry <= 0) {
      void fetchAsset();
      return;
    }
    refreshTimerRef.current = setTimeout(() => {
      void fetchAsset();
    }, msUntilExpiry);
    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [asset, fetchAsset]);

  const primaryUrl =
    asset?.primary_url ?? asset?.variants?.original?.url ?? null;

  return {
    asset,
    primaryUrl,
    isLoading,
    error,
    refresh: fetchAsset,
  };
}
