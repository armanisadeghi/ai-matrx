/**
 * features/file-analysis/hooks/shared-cache.ts
 *
 * Module-level subscribe-and-share cache for the file-analysis hooks.
 *
 * Problem this solves: every component that called `useFileAnalysis(fileId)`
 * was firing its own GET on mount. Opening the Studio mounted:
 *   - StudioShell        → useFileAnalysis
 *   - InspectorRail      → useFileAnalysis (duplicate)
 *   - Each tab panel     → useFileAnalysis (more duplicates)
 *   - ThumbnailStrip     → usePages
 *
 * That's 4+ identical fetches per Studio visit, and switching to a new
 * route remounted everything from scratch even though the data was just
 * downloaded by the AnalysisTab seconds ago.
 *
 * This module gives the hooks a shared cache + dedup so:
 *   - First subscriber for a fileId triggers the fetch.
 *   - Subsequent subscribers attach to the same in-flight promise.
 *   - Once data is in cache, mounts are SYNCHRONOUS (no flash).
 *   - Route changes inherit the cache because module state survives.
 *   - Realtime / mutator callbacks invalidate-and-refetch through the
 *     same channel — every subscriber sees the new data atomically.
 */

"use client";

import { useCallback, useEffect, useState } from "react";

export interface CacheEntry<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** Stable promise resolved when the in-flight fetch settles. */
  inflight: Promise<void> | null;
  /** Components currently consuming this entry. */
  subscribers: Set<() => void>;
}

export interface SharedHookResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  /** Imperative mutate — replaces the cached value + notifies subscribers. */
  mutate: (next: T | ((prev: T | null) => T | null)) => void;
}

interface Store<T> {
  cache: Map<string, CacheEntry<T>>;
  fetcher: (key: string, signal: AbortSignal) => Promise<T>;
}

export function createSharedStore<T>(
  fetcher: (key: string, signal: AbortSignal) => Promise<T>,
): Store<T> {
  return { cache: new Map(), fetcher };
}

function ensureEntry<T>(store: Store<T>, key: string): CacheEntry<T> {
  let entry = store.cache.get(key);
  if (!entry) {
    entry = {
      data: null,
      loading: false,
      error: null,
      inflight: null,
      subscribers: new Set(),
    };
    store.cache.set(key, entry);
  }
  return entry;
}

function notify<T>(entry: CacheEntry<T>): void {
  // Snapshot the subscriber set so a cb that triggers another fetch can't
  // mutate the set mid-iteration.
  for (const cb of Array.from(entry.subscribers)) cb();
}

function startFetch<T>(
  store: Store<T>,
  key: string,
  entry: CacheEntry<T>,
): void {
  const controller = new AbortController();
  entry.loading = true;
  entry.error = null;
  notify(entry);
  entry.inflight = store
    .fetcher(key, controller.signal)
    .then((value) => {
      entry.data = value;
      entry.loading = false;
      entry.error = null;
      entry.inflight = null;
      notify(entry);
    })
    .catch((err) => {
      if (controller.signal.aborted) return;
      entry.loading = false;
      entry.error = err instanceof Error ? err.message : String(err);
      entry.inflight = null;
      notify(entry);
    });
}

/**
 * React hook factory — bind to a specific store.
 *
 * Returns the standard `{data, loading, error, refetch, mutate}` shape.
 * Multiple components calling this hook for the same `key` share state.
 */
export function useSharedStore<T>(
  store: Store<T>,
  key: string | null,
): SharedHookResult<T> {
  // Read synchronously from cache on first render so re-mounted consumers
  // skip the loading flash entirely when data is already there.
  const initial = key ? store.cache.get(key) : null;
  const [, force] = useState(0);
  const rerender = useCallback(() => force((n) => n + 1), []);

  useEffect(() => {
    if (!key) return;
    const entry = ensureEntry(store, key);
    entry.subscribers.add(rerender);
    // Kick off fetch if we don't have data + nothing is in flight.
    if (!entry.data && !entry.inflight && !entry.error) {
      startFetch(store, key, entry);
    }
    return () => {
      entry.subscribers.delete(rerender);
      // We deliberately don't evict on zero-subscribers — the next mount
      // (e.g. coming back to this file later in the session) gets instant
      // data. Module-scope memory is fine for the kind of data we hold
      // (a few KB to a few MB per file, capped by how many files the user
      // touches per session).
    };
  }, [store, key, rerender]);

  const refetch = useCallback(() => {
    if (!key) return;
    const entry = ensureEntry(store, key);
    if (entry.inflight) return; // already fetching
    startFetch(store, key, entry);
  }, [store, key]);

  const mutate = useCallback(
    (next: T | ((prev: T | null) => T | null)) => {
      if (!key) return;
      const entry = ensureEntry(store, key);
      const resolved =
        typeof next === "function"
          ? (next as (prev: T | null) => T | null)(entry.data)
          : next;
      entry.data = resolved;
      notify(entry);
    },
    [key],
  );

  const entry = key ? store.cache.get(key) : null;
  return {
    data: entry?.data ?? initial?.data ?? null,
    loading: entry?.loading ?? false,
    error: entry?.error ?? null,
    refetch,
    mutate,
  };
}

/** Imperative invalidate-and-refetch (used by Realtime subscribers etc). */
export function invalidateKey<T>(store: Store<T>, key: string): void {
  const entry = store.cache.get(key);
  if (!entry) return;
  if (!entry.inflight) startFetch(store, key, entry);
}

/** Imperative read of the current cached value (no React subscription). */
export function peekKey<T>(store: Store<T>, key: string): T | null {
  return store.cache.get(key)?.data ?? null;
}

/**
 * Imperative write — replace the cached value for `key` and notify all
 * subscribers. Used for optimistic updates: a mutator (e.g. a save call)
 * can push the new shape into the cache immediately, without waiting for
 * Realtime to round-trip the change. Realtime + invalidateKey will still
 * fire later and converge to the canonical server state, so this is
 * "fast-path"-only — never the source of truth.
 *
 * Pass a value to overwrite outright, or a function to derive next from
 * previous (useful for upserts into a list).
 */
export function setKey<T>(
  store: Store<T>,
  key: string,
  next: T | ((prev: T | null) => T),
): void {
  const entry = ensureEntry(store, key);
  const resolved =
    typeof next === "function"
      ? (next as (prev: T | null) => T)(entry.data)
      : next;
  entry.data = resolved;
  notify(entry);
}
