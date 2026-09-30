"use client";

// features/flashcards/data/useMaxCardsPerRun.ts
//
// The most cards one generation may make — the `flashcards.max_cards_per_run`
// feature knob (platform.feature_knob), read through the one runtime reader.
// The ONE read both generating screens use (Create deck, Add more cards); it
// replaced a `COUNT_MAX = 50` constant copied into each. No constant stands in
// for the knob: while it loads the screens wait, and if it cannot be read the
// screens say so and refuse to run rather than guess a limit.

import { useEffect, useState } from "react";
import { knobInt } from "@/lib/knobs/featureKnobs";

export const FLASHCARDS_KNOB_FEATURE = "flashcards";
export const MAX_CARDS_PER_RUN_KEY = "max_cards_per_run";

/** The fewest cards a run may ask for — a floor of meaning, not a knob. */
export const MIN_CARDS_PER_RUN = 1;

export interface MaxCardsPerRun {
  /** The knob value; null while loading or when the read failed. */
  max: number | null;
  /** A sentence for the screen when the knob could not be read. */
  error: string | null;
}

export function readMaxCardsPerRun(): Promise<number> {
  return knobInt(FLASHCARDS_KNOB_FEATURE, MAX_CARDS_PER_RUN_KEY);
}

/** Clamp a requested card count to [MIN_CARDS_PER_RUN, max]. */
export function clampCardCount(requested: number, max: number, fallback = 10): number {
  return Math.min(max, Math.max(MIN_CARDS_PER_RUN, requested || fallback));
}

export function useMaxCardsPerRun(): MaxCardsPerRun {
  const [state, setState] = useState<MaxCardsPerRun>({ max: null, error: null });
  useEffect(() => {
    let cancelled = false;
    readMaxCardsPerRun()
      .then((max) => {
        if (!cancelled) setState({ max, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          max: null,
          error: `The most cards one run may make could not be read (${
            err instanceof Error ? err.message : String(err)
          }), so cards cannot be made right now. Reload the page to try again.`,
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
