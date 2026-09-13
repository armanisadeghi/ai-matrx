"use client";

import { useEffect, useRef } from "react";

/**
 * 🚨 ONCE PER RUN, NEVER PER RENDER — the ONE way a Masterwork dialog hands a
 * finished durable run back to the page.
 *
 * The wall it closes (Bugbot, 163c3466): the triage dialog handed its result
 * back from `useEffect(..., [result, onApplied])`. The page passes a fresh
 * arrow on every render and the callback refreshes the workspace, which
 * re-renders the page, which hands the SAME result back again — an endless
 * refresh loop that outlived Close, because the dialog stays mounted and the
 * result was never cleared. Every sibling ingest dialog had the same shape.
 *
 * So: the callback is read through a ref (its identity is never a trigger), and
 * a run is handed back exactly once — keyed on its RUN ID, which is stable for
 * the life of a run and new for the next one. (A run with no id yet falls back
 * to the result object's identity, which `run.reset()` clears.)
 */
export function useRunOutcome<TResult>(
  run: { runId: string | null; result: TResult | null },
  onResult: (() => void) | undefined,
  options?: {
    /**
     * Hand back only the runs that actually changed something. Read through a
     * ref like the callback, so an inline arrow costs nothing.
     */
    when?: (result: TResult) => boolean;
  },
): void {
  const callbackRef = useRef(onResult);
  callbackRef.current = onResult;
  const whenRef = useRef(options?.when);
  whenRef.current = options?.when;
  /** The run already handed back — its id, not a boolean: the NEXT run must be
   * handed back in its turn. */
  const deliveredRef = useRef<string | TResult | null>(null);

  const { result, runId } = run;
  useEffect(() => {
    if (!result) return;
    const key = runId ?? result;
    if (deliveredRef.current === key) return;
    if (whenRef.current && !whenRef.current(result)) return;
    deliveredRef.current = key;
    callbackRef.current?.();
  }, [result, runId]);
}
