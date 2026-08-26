/**
 * features/files/hooks/useFileAsset.ts
 *
 * Canonical "give me a URL to render this file" hook. Wraps the
 * `GET /files/{file_id}/asset` endpoint and exposes the resulting
 * {@link Asset} envelope plus the primary inline-renderable URL.
 *
 * Why this hook instead of {@link useFileSrc}: the asset endpoint
 * returns every preset variant in one shot (cover, OG, thumbnail,
 * favicons, etc.) AND it honours the same durable-URL routing rules the
 * rest of the system uses (public files get CDN URLs; private/shared get
 * durable authenticated inline URLs). New renderers should default to this hook;
 * `useFileSrc` covers callers that only need the raw inline URL
 * for the original file.
 *
 * Lifecycle:
 *   - Re-fetches whenever `fileId` changes. The URLs are durable, so
 *     `refresh()` exists only to re-read a mutated envelope (rename,
 *     new variant, visibility flip).
 *
 * Pattern: plain React state + effects — no TanStack Query in
 * `features/files/hooks/` yet.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
// hooks inside features/files/** import sibling modules directly to avoid
// cycles through a deleted barrel. eslint-disable for features/files/api
// remains until api/ is split or re-exported differently.
// eslint-disable-next-line no-restricted-imports
import { getAssetForFile } from "@/features/files/api/assets";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { extractErrorMessage } from "@/utils/errors";
// eslint-disable-next-line no-restricted-imports
import type { Asset } from "@/features/files/types";

// ─── Module-scoped fetch dedup + short cache ─────────────────────────────────
//
// File-browser surfaces stack consumers on the same id: the grid row's
// `MediaThumbnail` and the preview pane's `FilePreview` both call
// `useFileAsset(selectedFileId)` for the same file — so every selection
// change fires `GET /files/{id}/asset` twice, once per mount. Add to that
// the route-mount churn from `app/(a)/files/[[...path]]/page.tsx` which
// rebuilds the pane on path changes, and the same id can hit the network
// three or four times in under a second.
//
// Same shape as the `fetchProcessedDocument` dedup shipped in `76923f146`:
// an in-flight `Map<key, Promise>` so concurrent callers share one network
// round-trip, plus a small resolved cache so a fresh result is reused for
// FETCH_ASSET_CACHE_TTL_MS. The key includes `userId` so a session switch
// can't reuse the previous user's asset.

const FETCH_ASSET_CACHE_TTL_MS = 30_000;

interface AssetCacheEntry {
  resolvedAt: number;
  asset: Asset;
}

const fetchAssetInflight = new Map<string, Promise<Asset>>();
const fetchAssetCache = new Map<string, AssetCacheEntry>();

function fetchAssetCacheKey(fileId: string, userId: string | null): string {
  return `${userId ?? "<none>"}:${fileId}`;
}

async function fetchAssetForFile(
  fileId: string,
  userId: string | null,
): Promise<Asset> {
  const key = fetchAssetCacheKey(fileId, userId);

  const cached = fetchAssetCache.get(key);
  if (cached && Date.now() - cached.resolvedAt < FETCH_ASSET_CACHE_TTL_MS) {
    return cached.asset;
  }

  const existing = fetchAssetInflight.get(key);
  if (existing) return existing;

  const promise = getAssetForFile(fileId)
    .then(({ data }) => {
      fetchAssetCache.set(key, { resolvedAt: Date.now(), asset: data });
      return data;
    })
    .finally(() => {
      fetchAssetInflight.delete(key);
    });

  fetchAssetInflight.set(key, promise);
  return promise;
}

/**
 * Drop cached Asset envelopes for `fileId`. Call after any mutation that
 * could change what `GET /files/{id}/asset` returns: a rename, a new
 * variant render, a visibility flip, a re-share. Without this, callers
 * within the 30s window keep seeing the pre-mutation envelope.
 *
 * Pass no args to evict everything (e.g. on sign-out / user switch).
 */
export function invalidateFileAsset(fileId?: string): void {
  if (fileId == null) {
    fetchAssetCache.clear();
    return;
  }
  // Key shape is `${userId}:${fileId}` — match the tail segment so we
  // evict every user combination for this file. File ids are UUIDs so
  // `:<id>` can't appear inside another segment.
  const needle = `:${fileId}`;
  for (const key of fetchAssetCache.keys()) {
    if (key.endsWith(needle)) fetchAssetCache.delete(key);
  }
}

export interface UseFileAssetOptions {
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
  const { enabled = true } = options;
  const userId = useAppSelector(selectUserId);
  const [asset, setAsset] = useState<Asset | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doFetch = useCallback(async () => {
    if (!fileId || !enabled) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchAssetForFile(fileId, userId);
      setAsset(data);
    } catch (err) {
      setError(extractErrorMessage(err));
      setAsset(null);
    } finally {
      setIsLoading(false);
    }
  }, [fileId, enabled, userId]);

  // Exposed `refresh()` is the user's explicit "give me fresh data" lever —
  // bust the cache before re-fetching, otherwise a caller still gets the
  // 30s-stale entry. The internal effect doesn't invalidate (it relies on
  // the cache for the dedup win).
  const refresh = useCallback(async () => {
    if (fileId) invalidateFileAsset(fileId);
    await doFetch();
  }, [fileId, doFetch]);

  useEffect(() => {
    if (!fileId || !enabled) {
      setAsset(null);
      return;
    }
    void doFetch();
  }, [fileId, enabled, doFetch]);

  const primaryUrl =
    asset?.primary_url ?? asset?.variants?.original?.url ?? null;

  return {
    asset,
    primaryUrl,
    isLoading,
    error,
    refresh,
  };
}
