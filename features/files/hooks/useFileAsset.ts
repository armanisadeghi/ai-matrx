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
 *   - No proactive background refresh. Once the browser has rendered the
 *     bytes, the URL's expiry is irrelevant — the image stays on screen
 *     from the browser's HTTP cache. If a caller needs a guaranteed-fresh
 *     URL (e.g. for a download started long after mount), it can call
 *     `refresh()` explicitly.
 *
 * Pattern: plain React state + effects — no TanStack Query in
 * `features/files/hooks/` yet.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { getAssetForFile } from "@/features/files/api/assets";
import { extractErrorMessage } from "@/utils/errors";
import type { Asset } from "@/features/files/types";

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

export function useFileAsset(
  fileId: string | null | undefined,
  options: UseFileAssetOptions = {},
): UseFileAssetResult {
  const { signedUrlTtl = 3600, enabled = true } = options;
  const [asset, setAsset] = useState<Asset | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAsset = useCallback(async () => {
    if (!fileId || !enabled) return;
    setIsLoading(true);
    setError(null);
    try {
      const { data } = await getAssetForFile(fileId, {
        signed_url_ttl: signedUrlTtl,
      });
      setAsset(data);
    } catch (err) {
      setError(extractErrorMessage(err));
      setAsset(null);
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
