/**
 * features/file-analysis/hooks/usePageThumbnail.ts
 *
 * Module-cached per-page rendered thumbnail. Keyed by (fileId, pageId,
 * dpi) so the ThumbnailStrip + the image card grid + any future surface
 * share one fetch per page instead of paying N×server-render-time.
 *
 * Cache lives forever for the session — page renders are idempotent
 * server-side and a 50dpi PNG for an 8.5x11 page is ~10 KB.
 */

"use client";

import { useEffect, useState } from "react";
import * as Api from "@/features/file-analysis/api/file-analysis";

type Key = string; // `${fileId}|${pageId}|${dpi}`

interface CacheEntry {
  png: string | null;
  inflight: Promise<void> | null;
  error: string | null;
}

// LRU-bounded: data-url PNGs are 10-50KB each; an unbounded Map grew
// without limit while browsing 500-page docs (audit W5). Map iteration
// order is insertion order, so delete+set on read keeps it LRU.
const MAX_CACHE_ENTRIES = 150;
const cache = new Map<Key, CacheEntry>();

function cacheGet(key: Key): CacheEntry | undefined {
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
  }
  return hit;
}

function cacheSet(key: Key, entry: CacheEntry): void {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, entry);
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

function k(fileId: string, pageId: string, dpi: number): Key {
  return `${fileId}|${pageId}|${dpi}`;
}

async function fetchThumbnail(
  fileId: string,
  pageId: string,
  dpi: number,
): Promise<string | null> {
  try {
    const { data } = await Api.renderPageWithOverlay(fileId, {
      page_id: pageId,
      overlays: [],
      dpi,
      return_format: "png",
    });
    return `data:image/png;base64,${data.image_base64}`;
  } catch {
    return null;
  }
}

export function usePageThumbnail(
  fileId: string | null,
  pageId: string | null,
  options?: { dpi?: number; enabled?: boolean },
): { png: string | null; loading: boolean; error: string | null } {
  const dpi = options?.dpi ?? 50;
  const enabled = options?.enabled ?? true;
  const key = fileId && pageId ? k(fileId, pageId, dpi) : null;
  const initial = key ? cacheGet(key) : null;
  const [png, setPng] = useState<string | null>(initial?.png ?? null);
  const [loading, setLoading] = useState<boolean>(
    !!key && enabled && !initial?.png && !initial?.error,
  );
  const [error, setError] = useState<string | null>(initial?.error ?? null);

  useEffect(() => {
    if (!key || !enabled) return undefined;
    let cancelled = false;
    let entry = cacheGet(key);
    if (!entry) {
      entry = { png: null, inflight: null, error: null };
      cacheSet(key, entry);
    }
    if (entry.png) {
      setPng(entry.png);
      setLoading(false);
      setError(null);
      return undefined;
    }
    if (entry.error && !entry.inflight) {
      setError(entry.error);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    if (!entry.inflight) {
      entry.inflight = fetchThumbnail(fileId!, pageId!, dpi).then((result) => {
        const e = cacheGet(key);
        if (!e) return;
        if (result) {
          e.png = result;
          e.error = null;
        } else {
          e.error = "render failed";
        }
        e.inflight = null;
      });
    }
    entry.inflight.then(() => {
      if (cancelled) return;
      const e = cacheGet(key);
      setPng(e?.png ?? null);
      setError(e?.error ?? null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [key, fileId, pageId, dpi, enabled]);

  return { png, loading, error };
}
