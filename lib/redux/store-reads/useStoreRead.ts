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

import { useEffect, useEffectEvent } from "react";
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
  options: { enabled?: boolean } = {},
): StoreRead<T> {
  const dispatch = useAppDispatch();
  const activeKey = options.enabled === false ? null : key;
  const entry = useAppSelector((state) => selectStoreRead(state, activeKey));
  const runRead = useEffectEvent(() => read());

  useEffect(() => {
    if (!activeKey) return;
    void dispatch(ensureStoreRead(activeKey, () => runRead()));
  }, [activeKey, dispatch]);

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
