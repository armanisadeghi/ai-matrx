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
 * const beginRequest = useLatestRequest();
 *
 * const load = useCallback(async () => {
 *   const isCurrent = beginRequest();   // claim this attempt
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
 * }, [appId, beginRequest]);
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

/**
 * Marks a new attempt as the current one and returns a predicate reporting
 * whether it still is. Call it once at the top of the async function, then
 * check the predicate before EVERY state write that follows an `await`.
 */
export type BeginRequest = () => () => boolean;

/**
 * 🚨 RETURNS THE FUNCTION ITSELF, NOT AN OBJECT WRAPPING IT — deliberately, and
 * this is the whole reason the signature looks like that.
 *
 * The first version returned `{ begin }`. That object literal is a NEW
 * reference on every render, and the entire point of this hook is to be named
 * in the dependency array of the very `useCallback` that performs the fetch. An
 * unstable dependency there makes `load` unstable, which makes the
 * `useEffect(…, [load])` that calls it re-run on every render — an unbroken
 * refetch loop against the database with no user input at all. A guard against
 * a fetch race that instead causes infinite fetches is worse than the bug it
 * was written to fix, and it is a High-severity defect that shipped.
 *
 * Returning the `useCallback`-stable function directly removes the hazard by
 * construction: there is no object whose identity a caller could depend on. If
 * this ever needs to return more than one thing, it must be wrapped in
 * `useMemo` — never a bare literal. (Do not lean on the React Compiler to
 * memoize it for you: a primitive has to be correct on its own terms, and
 * correctness here is the difference between one fetch and unbounded ones.)
 */
export function useLatestRequest(): BeginRequest {
  const seqRef = useRef(0);

  return useCallback(() => {
    const mySeq = ++seqRef.current;
    return () => mySeq === seqRef.current;
  }, []);
}
