"use client";

// features/agents/mandates/useMandateGoal.ts
//
// ONE mandate's GOAL, for a surface that shows one mandate.
//
// The goal is a CODE DECLARATION (`declare_mandate(..., goal=...)` in aidream)
// and reaches the browser only through `GET /mandates`. There is no write path
// on the server — verified 2026-08-28: the pre-cutover mandate write payload
// does not carry the key at all — so every surface here shows it READ-ONLY and
// says where it is edited. A goal editor that cannot save would be a lie.

import { useEffect, useState } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  fetchMandateCatalogue,
  type MandateCatalogueEntry,
} from "./catalogue";

export interface MandateGoalState {
  /** The declared goal, or null when the declaration wrote none. */
  goal: string | null;
  /** The rest of the declaration, when the surface wants output_kind too. */
  declaration: MandateCatalogueEntry | null;
  loading: boolean;
  /** Verbatim failure — a surface renders this instead of a blank goal. */
  error: string | null;
  /** True once the catalogue answered: a null goal is then really "none". */
  loaded: boolean;
}

/** What one settled lookup produced, stamped with the key it answers for. */
interface GoalEntry {
  key: string;
  goal: string | null;
  declaration: MandateCatalogueEntry | null;
  error: string | null;
}

export function useMandateGoal(mandateKey: string | null): MandateGoalState {
  const dispatch = useAppDispatch();
  // ONE state slot, written only from async callbacks. Loading and the
  // no-mandate case are DERIVED below rather than set synchronously in the
  // effect (react-hooks/set-state-in-effect — cascading renders).
  const [entry, setEntry] = useState<GoalEntry | null>(null);

  useEffect(() => {
    if (!mandateKey) return;
    let cancelled = false;
    fetchMandateCatalogue(dispatch)
      .then((catalogue) => {
        if (cancelled) return;
        const declaration = catalogue[mandateKey] ?? null;
        setEntry({
          key: mandateKey,
          goal: declaration?.goal?.trim() || null,
          declaration,
          error: null,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setEntry({
          key: mandateKey,
          goal: null,
          declaration: null,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [dispatch, mandateKey]);

  // A settled entry counts only for the key it was fetched for — otherwise a
  // drawer switching mandates would show the previous mandate's goal for a
  // frame, which is worse than showing none.
  const settled = mandateKey && entry?.key === mandateKey ? entry : null;

  return {
    goal: settled?.goal ?? null,
    declaration: settled?.declaration ?? null,
    loading: Boolean(mandateKey) && settled === null,
    error: settled?.error ?? null,
    loaded: settled !== null && settled.error === null,
  };
}
