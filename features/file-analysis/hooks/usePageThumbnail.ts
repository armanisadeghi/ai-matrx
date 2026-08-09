/**
 * features/file-analysis/hooks/usePageThumbnail.ts
 *
 * Module-cached per-page rendered thumbnail. Keyed by (fileId, pageId,
 * dpi) so the ThumbnailStrip + the image card grid + any future surface
 * share one fetch per page instead of paying N×server-render-time.
 *
 * Successful renders cache forever for the session — page renders are
 * idempotent server-side and a 50dpi PNG for an 8.5x11 page is ~10 KB.
 * FAILURES do not: a transient render error (analysis still running,
 * server hiccup) auto-retries with backoff up to MAX_ATTEMPTS, and the
 * hook exposes `retry()` so the UI can offer a manual re-render after
 * that. The old behavior cached the first failure permanently, which is
 * how thumbnails got stuck as text placeholders forever (handoff
 * 2026-07-28).
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import * as Api from "@/features/file-analysis/api/file-analysis";

type Key = string; // `${fileId}|${pageId}|${dpi}`

interface CacheEntry {
  png: string | null;
  inflight: Promise<void> | null;
  error: string | null;
  attempts: number;
}

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1500;

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

function startFetch(key: Key, fileId: string, pageId: string, dpi: number): CacheEntry {
  let entry = cacheGet(key);
  if (!entry) {
    entry = { png: null, inflight: null, error: null, attempts: 0 };
    cacheSet(key, entry);
  }
  if (!entry.inflight && !entry.png) {
    entry.attempts += 1;
    entry.inflight = fetchThumbnail(fileId, pageId, dpi).then((result) => {
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
  return entry;
}

export function usePageThumbnail(
  fileId: string | null,
  pageId: string | null,
  options?: { dpi?: number; enabled?: boolean },
): { png: string | null; loading: boolean; error: string | null; retry: () => void } {
  const dpi = options?.dpi ?? 50;
  const enabled = options?.enabled ?? true;
  const key = fileId && pageId ? k(fileId, pageId, dpi) : null;
  const initial = key ? cacheGet(key) : null;
  const [png, setPng] = useState<string | null>(initial?.png ?? null);
  const [loading, setLoading] = useState<boolean>(
    !!key && enabled && !initial?.png && !initial?.error,
  );
  const [error, setError] = useState<string | null>(initial?.error ?? null);
  const [nonce, setNonce] = useState(0);

  const retry = useCallback(() => {
    if (!key) return;
    const e = cacheGet(key);
    if (e && !e.inflight) {
      e.error = null;
      e.attempts = 0;
    }
    setNonce((n) => n + 1);
  }, [key]);

  useEffect(() => {
    if (!key || !enabled || !fileId || !pageId) return undefined;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const sync = (entry: CacheEntry | undefined) => {
      if (cancelled) return;
      setPng(entry?.png ?? null);
      setError(entry?.error && entry.attempts >= MAX_ATTEMPTS ? entry.error : null);
      setLoading(
        !entry?.png && (!entry?.error || entry.attempts < MAX_ATTEMPTS),
      );
    };

    const run = () => {
      if (cancelled) return;
      let entry = cacheGet(key);
      if (entry?.png) {
        sync(entry);
        return;
      }
      if (entry?.inflight) {
        // Another consumer already kicked off this fetch — join it.
        sync(entry);
        void entry.inflight.then(run);
        return;
      }
      if (entry?.error) {
        if (entry.attempts >= MAX_ATTEMPTS) {
          sync(entry);
          return;
        }
        // Transient failure — retry after a short backoff, keeping the
        // loading state up (the strip shows a skeleton, never an error,
        // until the attempts are exhausted).
        sync(entry);
        retryTimer = setTimeout(() => {
          if (cancelled) return;
          const e = cacheGet(key);
          if (e) e.error = null;
          const started = startFetch(key, fileId, pageId, dpi);
          sync(started);
          void started.inflight?.then(run);
        }, RETRY_DELAY_MS * entry.attempts);
        return;
      }
      entry = startFetch(key, fileId, pageId, dpi);
      sync(entry);
      void entry.inflight?.then(run);
    };

    run();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [key, fileId, pageId, dpi, enabled, nonce]);

  return { png, loading, error, retry };
}
