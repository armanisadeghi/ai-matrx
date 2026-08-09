"use client";

/**
 * useLatestRequest — makes a superseded async response impossible to apply.
 *
 * THE BUG THIS KILLS: a surface refetches whenever some input changes (a
 * `?app=` scope, a search box, a selected id). Two fetches are then in flight
 * at once, and **responses do not arrive in the order they were sent.** The
 * older one lands last, calls `setRows`, and wins — so the table shows app A's
 * runs while the banner, the URL, and every label already say app B.
 *
 * That is not stale data, which announces itself. It is the WRONG RECORD under
 * a CONFIDENT label — the same failure `StaleDataNotice` exists to prevent on
 * the error path, arriving through the success path instead. Clearing rows when
 * a fetch FAILS (which this repo already does) closes only half the hole: a
 * fetch that succeeds late is just as capable of mislabeling the screen, and
 * nothing about it looks wrong.
 *
 * `AbortController` is the other half of the answer and a good thing to add on
 * top — but it is not a substitute. An abort races the response; the request may
 * already have resolved, and a non-`fetch` data source (a Supabase client call,
 * an RPC wrapper) often has no signal to give. This guard is source-agnostic and
 * final: it decides at APPLY time, which is the only moment that matters.
 *
 * ```ts
 * const latest = useLatestRequest();
 *
 * const load = useCallback(async () => {
 *   const isCurrent = latest.begin();   // claim this attempt
 *   setLoading(true);
 *   try {
 *     const data = await fetchScopedRows(appId);
 *     if (!isCurrent()) return;         // a newer load already started
 *     setRows(data);
 *   } catch (err) {
 *     if (!isCurrent()) return;         // don't let an old failure blank new rows
 *     setRows([]);
 *     setLoadFailed(true);
 *   } finally {
 *     if (isCurrent()) setLoading(false);
 *   }
 * }, [appId, latest]);
 * ```
 *
 * **Guard the catch and the finally too, not just the success path.** A stale
 * REJECTION is the mirror-image bug: it wipes the rows the current request just
 * loaded and raises a "couldn't load" notice about a request nobody is waiting
 * for. And an early `setLoading(false)` from a superseded attempt reports the
 * surface as settled while the real one is still in flight.
 *
 * `begin()` returns the predicate rather than exposing a counter, so there is no
 * sequence number to compare wrongly and no way to ask "is my request current?"
 * without first having declared one.
 *
 * Three hand-rolled copies of this exact `requestSeq`/`reqIdRef` pattern predate
 * it — `useServerAgentSearch`, `useRagSearch`, `useContextPreview`. They are
 * correct; they are just the evidence that this is a class, not an incident. New
 * code uses this hook, and those three collapse onto it when next touched.
 */

import { useCallback, useRef } from "react";

export interface LatestRequest {
  /**
   * Marks a new attempt as the current one and returns a predicate that reports
   * whether it still is. Call it once at the top of the async function, then
   * check the predicate before EVERY state write that follows an `await`.
   */
  begin: () => () => boolean;
}

export function useLatestRequest(): LatestRequest {
  const seqRef = useRef(0);

  const begin = useCallback(() => {
    const mySeq = ++seqRef.current;
    return () => mySeq === seqRef.current;
  }, []);

  return { begin };
}
