"use client";

/**
 * THE hand-rolled read, done once (RC-B12 round 12). Components that fetched
 * in a `useEffect` with `const [loading, setLoading] = useState(true)` and a
 * `catch { console.error(…) }` left their list at `[]` when the read failed —
 * and the empty view then said "No items yet". `useRead` owns the three
 * states, so a failure is always a status the view can gate on:
 *
 *   const read = useRead(() => listThings(orgId), [orgId]);
 *   <ReadGate status={read.status} error={read.error} onRetry={read.retry}
 *             what="your things" isEmpty={!read.data?.length} empty={<p>No things yet.</p>}>
 *     <ThingList things={read.data ?? []} />
 *   </ReadGate>
 *
 * - status: "loading" while a read is in flight (earlier data stays visible),
 *   "error" when the latest read failed, "ready" when it succeeded (or when the
 *   read is disabled — nothing was asked, so nothing is claimed).
 * - retry(): run the read again.
 * - setData(): local edits after a create/delete, without a re-read.
 * Late answers from a superseded read are dropped.
 */
import { useEffect, useEffectEvent, useState } from "react";
import type { ReadStatus } from "@/components/read-state/ReadGate";

export interface ReadResult<T> {
  data: T | undefined;
  status: ReadStatus;
  error: unknown;
  isLoading: boolean;
  isError: boolean;
  /** A read has succeeded at least once — its value is known (stale-while-error for counts and rows). */
  hasData: boolean;
  retry: () => void;
  setData: (next: T | ((prev: T | undefined) => T)) => void;
}

export function useRead<T>(
  read: () => Promise<T>,
  /** What the read depends on — serializable values (ids, filters). A change re-reads. */
  deps: readonly unknown[],
  options: { enabled?: boolean; initialData?: T } = {},
): ReadResult<T> {
  const { enabled = true, initialData } = options;
  const [data, setDataState] = useState<T | undefined>(initialData);
  const [attempt, setAttempt] = useState(0);
  // Status is DERIVED from which read last settled (the react-hooks lint
  // forbids setting state synchronously inside the effect): a read is in
  // flight exactly while the latest settled key is not the current key.
  const [settled, setSettled] = useState<{ key: string; ok: boolean; error: unknown } | null>(null);
  const [everSucceeded, setEverSucceeded] = useState(false);
  const runRead = useEffectEvent(() => read());
  const fetchKey = JSON.stringify([attempt, ...deps]);

  useEffect(() => {
    if (!enabled) return undefined;
    let superseded = false;
    let promise: Promise<T>;
    try {
      promise = Promise.resolve(runRead());
    } catch (err) {
      promise = Promise.reject(err);
    }
    promise.then(
      (result) => {
        if (superseded) return;
        setDataState(result);
        setEverSucceeded(true);
        setSettled({ key: fetchKey, ok: true, error: null });
      },
      (err: unknown) => {
        if (superseded) return;
        setSettled({ key: fetchKey, ok: false, error: err ?? new Error("The read failed") });
      },
    );
    return () => {
      // deps changed, retry, or unmount: this run's answer is no longer wanted.
      superseded = true;
    };
  }, [enabled, fetchKey]);

  const status: ReadStatus = !enabled
    ? "ready"
    : settled?.key !== fetchKey
      ? "loading"
      : settled.ok
        ? "ready"
        : "error";
  const error = status === "error" ? settled?.error : null;

  const retry = () => setAttempt((n) => n + 1);
  const setData = (next: T | ((prev: T | undefined) => T)) => {
    setDataState((prev) => (typeof next === "function" ? (next as (p: T | undefined) => T)(prev) : next));
  };

  return { data, status, error, isLoading: status === "loading", isError: status === "error", hasData: everSucceeded, retry, setData };
}
