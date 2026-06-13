/**
 * features/files/hooks/useInfiniteWindow.ts
 *
 * Generic windowed-rendering hook. Given a fixed-length array of items
 * and a sentinel ref, exposes a sliced view that grows by `pageSize`
 * every time the sentinel scrolls into view.
 *
 * Works for both the file table (rows) and the file grid (cells) —
 * the consumer just slices `items.slice(0, visibleCount)` and renders
 * the sentinel below.
 *
 * Why client-windowing (not server pagination):
 *   - The cloud-files tree is loaded into Redux as a single RPC call
 *     and cached locally. There's no per-page network cost; the
 *     issue is purely DOM / render cost.
 *   - Users scroll fast and expect zero latency between "I've
 *     reached the bottom" and "more rows appear." A network round-
 *     trip per page would feel sluggish.
 *   - When the dataset eventually exceeds what the tree RPC returns
 *     (currently 5000 rows), this hook stays — we'd just feed it a
 *     server-paginated array source instead.
 *
 * The IntersectionObserver fires once per sentinel-enter-view, so
 * scrolling fast doesn't bump the count by 10× — each frame at most
 * grows by `pageSize`.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface UseInfiniteWindowOptions {
  /** Total number of items to potentially render. */
  total: number;
  /**
   * Initial visible count. Default 50 — about a screen and a half on
   * the file table, fast to render even on slower devices.
   */
  initial?: number;
  /** How many more rows to show each time the sentinel hits. Default 50. */
  pageSize?: number;
  /**
   * Whenever any of these values change, the cursor resets to
   * `initial`. Pass the filter / sort / search / parent-folder so a
   * user switching contexts always starts at the top instead of
   * inheriting a deep scroll position.
   */
  resetKey?: unknown;
}

export interface UseInfiniteWindowResult {
  /** How many items the consumer should render right now. */
  visibleCount: number;
  /** True when there are still hidden items below the visible window. */
  hasMore: boolean;
  /**
   * Attach to a single DOM element rendered after the last visible
   * item. The hook observes its intersection with the viewport and
   * bumps `visibleCount` when it scrolls into view.
   */
  sentinelRef: (node: HTMLElement | null) => void;
  /** Manual "show more" handler — useful for an explicit button fallback. */
  loadMore: () => void;
  /** Reset to the initial window. Useful for "scroll to top" buttons. */
  reset: () => void;
  /**
   * Grow the window (if needed) so the item at `index` is rendered. Used to
   * reveal a programmatically-focused row (e.g. a just-uploaded file) that
   * would otherwise sit below the fold. Never shrinks the window.
   */
  ensureIndexVisible: (index: number) => void;
}

const DEFAULT_INITIAL = 50;
const DEFAULT_PAGE_SIZE = 50;

export function useInfiniteWindow({
  total,
  initial = DEFAULT_INITIAL,
  pageSize = DEFAULT_PAGE_SIZE,
  resetKey,
}: UseInfiniteWindowOptions): UseInfiniteWindowResult {
  const [visibleCount, setVisibleCount] = useState(() =>
    Math.min(initial, Math.max(0, total)),
  );

  // Reset on context change. Must run before the IO observer below
  // notices the (possibly) new sentinel — useEffect order achieves
  // that since this effect's deps trip first when resetKey changes.
  useEffect(() => {
    setVisibleCount(Math.min(initial, Math.max(0, total)));
    // We intentionally bind to `resetKey` only — `initial` and `total`
    // are read inside but their changes shouldn't reset the cursor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  // When `total` shrinks (filter applied locally), clamp the cursor
  // so we don't render past the end. When `total` grows (realtime
  // insert, server fetched more), keep the existing cursor; new
  // items appear "below the fold" and the user discovers them by
  // scrolling.
  useEffect(() => {
    setVisibleCount((c) => Math.min(c, Math.max(0, total)));
  }, [total]);

  const loadMore = useCallback(() => {
    setVisibleCount((c) => Math.min(c + pageSize, total));
  }, [pageSize, total]);

  const reset = useCallback(() => {
    setVisibleCount(Math.min(initial, Math.max(0, total)));
  }, [initial, total]);

  // Reveal a specific index. Bumps the cursor just past the target (plus a
  // small buffer so the row isn't flush against the sentinel) without ever
  // shrinking the current window.
  const ensureIndexVisible = useCallback(
    (index: number) => {
      if (index < 0) return;
      setVisibleCount((c) => {
        const needed = Math.min(index + pageSize, total);
        return Math.max(c, needed);
      });
    },
    [pageSize, total],
  );

  // ── Sentinel observer ─────────────────────────────────────────────
  //
  // We use a callback-ref so consumers can mount the sentinel
  // conditionally (e.g. only when `hasMore`). When the ref attaches
  // to a node, we observe; when it detaches, we disconnect.
  const observerRef = useRef<IntersectionObserver | null>(null);
  const hasMoreRef = useRef(false);
  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;

  const sentinelRef = useCallback((node: HTMLElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    if (!node || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && hasMoreRef.current) {
            loadMoreRef.current();
          }
        }
      },
      {
        // Trigger ~one viewport early so the user never sees a blank
        // gap between the last row and the next batch loading.
        rootMargin: "300px 0px",
        threshold: 0,
      },
    );
    io.observe(node);
    observerRef.current = io;
  }, []);

  // Disconnect on unmount.
  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, []);

  const hasMore = visibleCount < total;
  hasMoreRef.current = hasMore;

  return useMemo(
    () => ({
      visibleCount,
      hasMore,
      sentinelRef,
      loadMore,
      reset,
      ensureIndexVisible,
    }),
    [visibleCount, hasMore, sentinelRef, loadMore, reset, ensureIndexVisible],
  );
}
