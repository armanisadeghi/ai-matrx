"use client";

/**
 * useStoreRead — a view's read, kept in Redux by key and read ONCE.
 *
 *   const topic = useStoreRead(`research.topic:${id}`, () => getTopic(id));
 *   topic.data · topic.status · topic.error · topic.refresh() · topic.setData(next)
 *
 * The first view to ask reads; a remount, a wake from sleep or a second view
 * of the same key renders the stored answer and reads nothing. `refresh()` is
 * the deliberate re-read (after a write, a stream's "done", a Retry button);
 * `setData()` puts a local edit in the store without a read.
 *
 * `key === null` (or `enabled: false`) asks nothing: status "ready", no data.
 * Slice + rules: `lib/redux/slices/storeReadsSlice.ts`.
 */

import { useEffect, useEffectEvent, useRef } from "react";
import { dispatchThunk, useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  ensureStoreRead,
  selectStoreRead,
  setStoreReadData,
  type StoreReadStatus,
} from "@/lib/redux/slices/storeReadsSlice";

export interface StoreRead<T> {
  data: T | undefined;
  status: StoreReadStatus;
  error: string | null;
  isLoading: boolean;
  isError: boolean;
  /** A read has answered at least once. */
  hasData: boolean;
  /** Read again now; resolves when the answer is in the store. */
  refresh: () => Promise<void>;
  /** A local edit, in the store, with no read. */
  setData: (next: T | ((prev: T | undefined) => T)) => void;
}

export function useStoreRead<T>(
  key: string | null,
  read: () => Promise<T>,
  options: {
    enabled?: boolean;
    /**
     * For an answer that goes stale while the person works elsewhere (study progress): a mount or
     * wake finding the kept answer older than this reads again in the background, keeping the old
     * answer on screen. Inside the window (a Board tile waking, a quick remount) nothing is read.
     */
    staleAfterMs?: number;
  } = {},
): StoreRead<T> {
  const dispatch = useAppDispatch();
  const activeKey = options.enabled === false ? null : key;
  const entry = useAppSelector((state) => selectStoreRead(state, activeKey));
  const runRead = useEffectEvent(() => read());

  const staleAfterMs = options.staleAfterMs;
  useEffect(() => {
    if (!activeKey) return;
    dispatchThunk(dispatch, (d, getState) => {
      const kept = selectStoreRead(getState(), activeKey);
      const stale =
        staleAfterMs !== undefined && kept?.status === "ready" && Date.now() - kept.at > staleAfterMs;
      return d(ensureStoreRead(activeKey, () => runRead(), stale ? { force: true, joinRunning: true } : {}));
    });
  }, [activeKey, dispatch, staleAfterMs]);

  const data = (entry?.hasData ? entry.data : undefined) as T | undefined;
  // Asked but not yet in the store (the first render before the effect): loading.
  const status: StoreReadStatus = !activeKey ? "ready" : (entry?.status ?? "loading");

  const refresh = async () => {
    if (!activeKey) return;
    await dispatch(ensureStoreRead(activeKey, read, { force: true }));
  };
  const setData = (next: T | ((prev: T | undefined) => T)) => {
    if (!activeKey) return;
    // The updater sees the store's CURRENT copy, never this render's (two
    // optimistic patches in one tick must both land).
    dispatchThunk(dispatch, (d, getState) => {
      const current = selectStoreRead(getState(), activeKey);
      const prev = (current?.hasData ? current.data : undefined) as T | undefined;
      const value = typeof next === "function" ? (next as (p: T | undefined) => T)(prev) : next;
      d(setStoreReadData({ key: activeKey, data: value }));
    });
  };

  return {
    data,
    status,
    error: status === "error" ? (entry?.error ?? null) : null,
    isLoading: status === "loading",
    isError: status === "error",
    hasData: entry?.hasData ?? false,
    refresh,
    setData,
  };
}

/**
 * Read again when `token` changes — a host's "bump to refresh" counter (`refreshKey`).
 * The token at mount is the baseline, so a remount or a wake from sleep (state kept, token
 * unchanged) reads nothing; only a real change after mount does.
 */
export function useRefreshWhenChanged(token: unknown, refresh: () => Promise<void>): void {
  const seen = useRef(token);
  const run = useEffectEvent(() => refresh());
  useEffect(() => {
    if (Object.is(seen.current, token)) return;
    seen.current = token;
    void run();
  }, [token]);
}
