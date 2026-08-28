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

export function useMandateGoal(mandateKey: string | null): MandateGoalState {
  const dispatch = useAppDispatch();
  const [state, setState] = useState<MandateGoalState>({
    goal: null,
    declaration: null,
    loading: Boolean(mandateKey),
    error: null,
    loaded: false,
  });

  useEffect(() => {
    if (!mandateKey) {
      setState({
        goal: null,
        declaration: null,
        loading: false,
        error: null,
        loaded: false,
      });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    fetchMandateCatalogue(dispatch)
      .then((catalogue) => {
        if (cancelled) return;
        const declaration = catalogue[mandateKey] ?? null;
        setState({
          goal: declaration?.goal?.trim() || null,
          declaration,
          loading: false,
          error: null,
          loaded: true,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          goal: null,
          declaration: null,
          loading: false,
          error: error instanceof Error ? error.message : String(error),
          loaded: false,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [dispatch, mandateKey]);

  return state;
}
