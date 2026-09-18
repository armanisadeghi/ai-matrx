"use client";

// features/masterwork/browse/useApproachRegistry.ts
//
// THE ONE WAY A SURFACE LOADS THE APPROACH REGISTRY.
//
// Wall W2 (observed live 2026-09-15, census row W2). On step 2 of
// `/masterwork/new?approach=interview` an Expert was shown, verbatim:
//
//     canceling statement due to statement timeout (57014)
//
// and then, after pressing "Try again", four card-shaped skeletons that never
// resolved and a Start button that never enabled. Two defects, and the second
// was the one with no way out:
//
//   RETRY BY ASSIGNMENT IS NOT A RETRY. The load effect was gated on its own
//   result (`if (approaches !== null) return;`, deps `[approaches]`) and "Try
//   again" ran `setApproaches(null)`. `approaches` was ALREADY null — the
//   failed load never set it — so React bailed out on the write, the dependency
//   never changed, the effect never re-ran, and clearing the error text left
//   the page rendering its loading state forever. Deterministic, every time,
//   regardless of what the database was doing.
//
// A retry must be an EVENT, never a value that happens to differ. `reload()`
// bumps an attempt counter, and the counter is the effect's only dependency, so
// asking again always asks again.
//
// All three Approach surfaces (the intake wizard, the catalog page, the
// add-to-Rulebook dialog) printed `err.message` at the Expert and two of them
// had no retry at all. They now share this hook: one load, one honest sentence,
// one working retry. `lib/failure/transport.ts` owns the sentence — raw engine
// prose never reaches a screen from here.

import { useCallback, useEffect, useState } from "react";
import { describeFailure } from "@/lib/failure/transport";
import {
  fetchDistillationApproaches,
  type DistillationApproach,
} from "./approaches";

/**
 * What an Expert is told when the registry read fails for a reason nobody has
 * words for. Never the engine's message: a read that failed tells her nothing
 * she can act on beyond "it did not load, and nothing of yours was lost".
 */
export const APPROACH_READ_FAILED =
  "We couldn't load the ways to get started. Nothing you told us was lost.";

export interface ApproachRegistryState {
  /** The rows, or null while the first answer is still outstanding. */
  approaches: DistillationApproach[] | null;
  /** An Expert-readable sentence, or null. Never engine prose. */
  error: string | null;
  /** True exactly while a read is outstanding — the ONLY reason to draw a
   *  loading state. An errored registry is not loading; it is broken. */
  loading: boolean;
  /** Ask again. Always re-reads, whatever the current state happens to be. */
  reload: () => void;
}

export function useApproachRegistry(
  /** Read only once this is true — the dialog reads on first open, not mount. */
  enabled = true,
): ApproachRegistryState {
  const [approaches, setApproaches] = useState<DistillationApproach[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchDistillationApproaches()
      .then((rows) => {
        if (cancelled) return;
        setApproaches(rows);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // The raw detail is already in the Error Inspector — every browser
        // Supabase call goes through `lib/diagnostics/supabaseErrorCapture`.
        // The console line is for whoever is standing at the screen.
        console.error("[masterwork] Approach registry read failed", err);
        const failure = describeFailure(err, {
          action: "loading the ways to get started",
          retrySafe: true,
        });
        // A rewritten sentence is safe to print BY CONSTRUCTION: transport and
        // database refusals are the only ones `describeFailure` writes itself.
        // Anything else still carries the thrower's own words, which for a
        // registry read means engine prose — so it never reaches the screen.
        setError(
          failure.transient
            ? `${failure.sentence} ${failure.remedy}`.trim()
            : APPROACH_READ_FAILED,
        );
        setApproaches(null);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // `attempt` is the whole point: a retry is an event, not a value.
  }, [enabled, attempt]);

  const reload = useCallback(() => {
    setApproaches(null);
    setError(null);
    setAttempt((n) => n + 1);
  }, []);

  return { approaches, error, loading, reload };
}
