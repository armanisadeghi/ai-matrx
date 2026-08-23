"use client";

/**
 * useWrittenProgress — keeps the DEFAULT face live while the panel is open.
 *
 * D-8 tier 1 is **written progress, always** — the default, no pictures, no
 * video. Until 2026-08-23 the panel loaded its progress list ONCE on mount and
 * nothing ever refreshed it, so even after the server started writing steps the
 * default face would have shown whatever existed at the moment the panel
 * opened and then frozen. The two optional tiers refreshed themselves; the
 * default one did not.
 *
 * ## Why a bounded poll and not a realtime subscription
 *
 * Both were on the table. The poll wins here on four counts:
 *
 * 1. **No `browser.*` table is in the `supabase_realtime` publication** —
 *    verified live. Realtime would mean a DB change on an append-only audit
 *    table whose RLS SELECT predicate is three `iam.accessible_entity_ids`
 *    unnests, re-evaluated per subscriber per row. That predicate would run on
 *    every browser action of every live run, forever.
 * 2. **The default face is a step list, not a token stream.** A person reading
 *    play-by-play cannot tell 2 s from instant. D-24 already settled that a
 *    timed cadence is the right shape for this panel; the expensive tier is
 *    deliberately the screenshot one.
 * 3. **This platform's freeze history is realtime's, not polling's** — roughly
 *    ten browser lockups, all traced to subscriptions, echoes, and
 *    dispatch-per-row (CLAUDE.md § Realtime). A poll that runs only while the
 *    panel is open, only while the run is live, and not at all while the tab is
 *    hidden has no echo class, no reconnect/backoff/catch-up machinery, and no
 *    channel lifecycle to leak.
 * 4. **The read is a cursor, not a refetch.** `sequence > lastSeen` on a unique
 *    index; a quiet browser costs one query returning zero rows, and a busy one
 *    lands in ONE batched dispatch.
 *
 * If this ever needs to be sub-second, the answer is the `supabase-realtime`
 * skill's Rule-1 checklist plus adding the table to the publication — not
 * shortening the interval.
 *
 * ## What stops it
 *
 * Unmount (the panel closed), the run reaching a terminal state, and
 * `document.hidden` (a backgrounded tab is not a viewer). Each is a real stop,
 * not a slower interval.
 */

import { useCallback, useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { WRITTEN_PROGRESS_POLL_MS } from "../constants";
import { loadProgressSince } from "../service";
import { appendProgress } from "../redux/cloudBrowserSlice";
import { selectProgress } from "../redux/selectors";

/** Run states with nothing left to say. */
const TERMINAL_RUN_STATES = new Set(["stopped", "failed", "failed_persistence"]);

export function useWrittenProgress(
  runId: string | null | undefined,
  runState: string | null | undefined,
) {
  const dispatch = useAppDispatch();
  const progress = useAppSelector(selectProgress);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlightRef = useRef(false);
  /** The cursor lives in a ref so the poll effect does not re-arm on every
   *  arriving step — an interval that restarts per event is a storm. */
  const cursorRef = useRef(0);

  const highest = progress.reduce((max, e) => (e.sequence > max ? e.sequence : max), 0);
  cursorRef.current = Math.max(cursorRef.current, highest);

  // A different run is a different timeline; the cursor must not carry over.
  useEffect(() => {
    cursorRef.current = 0;
  }, [runId]);

  const pull = useCallback(async () => {
    if (!runId || inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const fresh = await loadProgressSince(runId, cursorRef.current);
      if (fresh.length > 0) {
        cursorRef.current = fresh[fresh.length - 1].sequence;
        // ONE dispatch for the whole page — never one per row.
        dispatch(appendProgress(fresh));
      }
    } catch {
      // A missed tick is a missed tick. The next one re-reads from the same
      // cursor, so nothing is lost and nothing needs to be retried — and the
      // written-progress face must never become an error surface over its own
      // refresh.
    } finally {
      inFlightRef.current = false;
    }
  }, [dispatch, runId]);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (!runId) return;
    if (runState && TERMINAL_RUN_STATES.has(runState)) {
      // One last read so the final steps (stop, checkpoint) are never missed,
      // then nothing.
      void pull();
      return;
    }

    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      void pull();
    };
    tick();
    timerRef.current = setInterval(tick, WRITTEN_PROGRESS_POLL_MS);

    // Coming back to the tab reads immediately rather than waiting out a tick.
    const onVisible = () => {
      if (typeof document !== "undefined" && !document.hidden) void pull();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [runId, runState, pull]);

  return { refreshProgress: pull };
}
