"use client";

/**
 * useBlindShuffle
 *
 * Returns a function each mode's toolbar calls at the very start of its
 * "Submit All" handler. If the blind checkbox is ticked it:
 *   1. shuffles the column order (Fisher–Yates),
 *   2. reorders the mode's own columns array via its `setColumns` action
 *      (so the on-screen positions actually move — no per-page edit),
 *   3. dispatches `activateBlind({ order })` to turn masking on.
 *
 * If the checkbox is NOT ticked it dispatches `resetBlind()` so a stale
 * blind session from a previous run can't leak into a normal submit.
 *
 * The mode-specific `setColumns` action creator is passed in because
 * each mode owns its own slice — the toolbar already imports it.
 */

import type { UnknownAction } from "@reduxjs/toolkit";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectBlindEnabled } from "../redux/selectors";
import { activateBlind, resetBlind } from "../redux/battleSlice";
import { shuffleIds } from "./blind";

export function useBlindShuffle() {
  const dispatch = useAppDispatch();
  const blindEnabled = useAppSelector(selectBlindEnabled);

  return function maybeShuffleForBlind<T extends { columnId: string }>(
    columns: T[],
    setColumns: (cols: T[]) => UnknownAction,
  ): void {
    if (!blindEnabled) {
      dispatch(resetBlind());
      return;
    }
    if (columns.length === 0) {
      dispatch(resetBlind());
      return;
    }
    const shuffled = shuffleIds(columns.map((c) => c.columnId));
    const byId = new Map(columns.map((c) => [c.columnId, c]));
    const reordered = shuffled
      .map((id) => byId.get(id))
      .filter((c): c is T => Boolean(c));
    dispatch(setColumns(reordered));
    dispatch(activateBlind({ order: shuffled }));
  };
}
