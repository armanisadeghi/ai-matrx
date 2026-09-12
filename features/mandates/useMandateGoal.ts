"use client";

// features/mandates/useMandateGoal.ts
//
// ONE mandate's GOAL, for a surface that shows one mandate — and the ONLY hook
// that answers the question "what is this Mandate for, and does it have a goal
// at all?".
//
// 🚨 IT ASKS BOTH READERS (FIX-Q9, 2026-09-11). This hook used to read the code
// catalogue and nothing else, while the workspace read the stored row — so a
// Mandate created in the UI (stored goal, no code declaration) had its goal
// printed on one screen and *"No goal declared"* on another. The precedence now
// lives once, in `./goal`: THE STORED GOAL IS THE TRUTH, the code declaration
// is the fallback. Pass `storedGoal` whenever the surface already holds the row
// (`goalOfMandate(row)`); a surface that genuinely has no row passes nothing
// and gets the catalogue answer, which is still an answer, not a lie.
//
// It also re-reads on invalidation: `patchMandateGoal` clears every goal-
// bearing cache through `invalidateMandateCache`, and mounted surfaces must
// show the new goal WITHOUT a reload.

import { useEffect, useState } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  fetchMandateCatalogue,
  type MandateCatalogueEntry,
} from "./catalogue";
import { resolveMandateGoal, type MandateGoalSource } from "./goal";
import { onMandateCacheInvalidated } from "./service";

export interface MandateGoalState {
  /** The goal to print, or null when BOTH readers came back empty. */
  goal: string | null;
  /** Which reader answered — a surface words a code goal differently. */
  source: MandateGoalSource;
  /** The rest of the declaration, when the surface wants output_kind too. */
  declaration: MandateCatalogueEntry | null;
  loading: boolean;
  /** Verbatim failure — a surface renders this instead of a blank goal. */
  error: string | null;
  /**
   * True once the question is settled and a null `goal` really means "none".
   * A stored goal settles it on its own: the catalogue cannot contradict it.
   */
  loaded: boolean;
}

/** What one settled lookup produced, stamped with the key it answers for. */
interface GoalEntry {
  key: string;
  catalogueGoal: string | null;
  declaration: MandateCatalogueEntry | null;
  error: string | null;
}

export function useMandateGoal(
  mandateKey: string | null,
  /** The stored `agent.mandate.goal` when the surface holds the row. */
  storedGoal?: string | null,
): MandateGoalState {
  const dispatch = useAppDispatch();
  // ONE state slot, written only from async callbacks. Loading and the
  // no-mandate case are DERIVED below rather than set synchronously in the
  // effect (react-hooks/set-state-in-effect — cascading renders).
  const [entry, setEntry] = useState<GoalEntry | null>(null);
  // Bumped when a mandate write drops the caches, so this hook re-reads the
  // catalogue instead of serving the text the write just replaced.
  const [epoch, setEpoch] = useState(0);

  useEffect(
    () =>
      onMandateCacheInvalidated((invalidatedKey) => {
        if (!invalidatedKey || invalidatedKey === mandateKey) {
          setEpoch((value) => value + 1);
        }
      }),
    [mandateKey],
  );

  useEffect(() => {
    if (!mandateKey) return;
    let cancelled = false;
    fetchMandateCatalogue(dispatch)
      .then((catalogue) => {
        if (cancelled) return;
        const declaration = catalogue[mandateKey] ?? null;
        setEntry({
          key: mandateKey,
          catalogueGoal: declaration?.goal ?? null,
          declaration,
          error: null,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setEntry({
          key: mandateKey,
          catalogueGoal: null,
          declaration: null,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [dispatch, mandateKey, epoch]);

  // A settled entry counts only for the key it was fetched for — otherwise a
  // drawer switching mandates would show the previous mandate's goal for a
  // frame, which is worse than showing none.
  const settled = mandateKey && entry?.key === mandateKey ? entry : null;
  const resolved = resolveMandateGoal({
    stored: storedGoal,
    catalogue: settled?.catalogueGoal ?? null,
  });
  // The STORED goal needs no catalogue round trip to be true, so a surface
  // holding one is never "loading" and never waits to print it.
  const storedIsEnough = resolved.source === "stored";

  return {
    goal: resolved.goal,
    source: resolved.source,
    declaration: settled?.declaration ?? null,
    loading: Boolean(mandateKey) && settled === null && !storedIsEnough,
    error: storedIsEnough ? null : (settled?.error ?? null),
    loaded:
      storedIsEnough || (settled !== null && settled.error === null),
  };
}
