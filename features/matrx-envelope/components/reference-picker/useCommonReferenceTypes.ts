"use client";

/**
 * Which types the reference picker offers FIRST — read from the knob, never
 * from code.
 *
 * Law 6 (opinions become knobs): "the normal parts… things like chat or project
 * or task or note" (Arman, 2026-09-11) is a judgement about one organization's
 * work, so it lives in `platform.reference_picker.common_types`, seeded by
 * `migrations/reference_picker_common_types_knob.sql` and overridable per org.
 *
 * THE CURATION CANNOT HIDE ANYTHING. This knob orders a shortcut tier only; the
 * picker's "All types" browse is always the full reference-pickable set from the
 * registry, so no value here — including an empty list — can put a type out of
 * a user's reach.
 *
 * A missing or malformed knob RAISES in `featureKnobs` by design. That must not
 * cost the user their picker, so this hook reports the failure instead of
 * throwing: `error` is set, `tokens` is empty, and the caller opens the full
 * grouped list with nothing collapsed and screams to the console. Degraded is
 * visible and complete, never silent and never a frozen copy of the default.
 */

import { useEffect, useState } from "react";

import { knobStringList } from "@/lib/knobs/featureKnobs";

export const REFERENCE_PICKER_KNOB_FEATURE = "platform.reference_picker";
export const COMMON_TYPES_KNOB_KEY = "common_types";

export interface CommonReferenceTypesState {
  /** Entity-type tokens, in the order they should be offered. */
  tokens: string[];
  loading: boolean;
  error: Error | null;
}

export function useCommonReferenceTypes(): CommonReferenceTypesState {
  const [state, setState] = useState<CommonReferenceTypesState>({
    tokens: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const tokens = await knobStringList(
          REFERENCE_PICKER_KNOB_FEATURE,
          COMMON_TYPES_KNOB_KEY,
        );
        if (cancelled) return;
        setState({ tokens, loading: false, error: null });
      } catch (cause) {
        if (cancelled) return;
        const error =
          cause instanceof Error ? cause : new Error(String(cause));
        // Scream: the picker still works, but it is running uncurated and a
        // human needs to know the row is gone rather than wonder why the
        // shortcut tier vanished.
        console.error(
          `[ReferencePicker] no curated type tier — showing every type instead. ` +
            `Seed ${REFERENCE_PICKER_KNOB_FEATURE}.${COMMON_TYPES_KNOB_KEY} ` +
            `(migrations/reference_picker_common_types_knob.sql).`,
          error,
        );
        setState({ tokens: [], loading: false, error });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
