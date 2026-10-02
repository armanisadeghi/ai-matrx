"use client";

/**
 * Which types the reference picker offers FIRST, and which it never offers —
 * both read from knobs, never from code.
 *
 * Law 6 (opinions become knobs): "the normal parts… things like chat or project
 * or task or note" (Arman, 2026-09-11) is a judgement about one organization's
 * work, so it lives in `platform.reference_picker.common_types`, seeded by
 * `migrations/reference_picker_common_types_knob.sql` and overridable per org.
 * Which machinery a person never needs to link to ("Content-IR Kind",
 * "AI Endpoint" — G2 review, 2026-10-02) is the same kind of opinion:
 * `platform.reference_picker.hidden_types`, seeded by
 * `migrations/reference_picker_hidden_types_knob.sql`.
 *
 * A missing or malformed knob RAISES in `featureKnobs` by design. That must not
 * cost the user their picker, so these hooks report the failure instead of
 * throwing: `error` is set, `tokens` is empty, and the caller degrades to the
 * complete list (nothing curated, nothing hidden) and screams to the console.
 * Degraded is visible and complete, never silent and never a frozen copy of the
 * default.
 */

import { useEffect, useState } from "react";

import { knobStringList } from "@/lib/knobs/featureKnobs";

export const REFERENCE_PICKER_KNOB_FEATURE = "platform.reference_picker";
export const COMMON_TYPES_KNOB_KEY = "common_types";
export const HIDDEN_TYPES_KNOB_KEY = "hidden_types";

export interface CommonReferenceTypesState {
  /** Entity-type tokens, in the order they should be offered. */
  tokens: string[];
  loading: boolean;
  error: Error | null;
}

function useReferencePickerTokenList(
  key: string,
  degradedMessage: string,
  seedFile: string,
): CommonReferenceTypesState {
  const [state, setState] = useState<CommonReferenceTypesState>({
    tokens: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const tokens = await knobStringList(REFERENCE_PICKER_KNOB_FEATURE, key);
        if (cancelled) return;
        setState({ tokens, loading: false, error: null });
      } catch (cause) {
        if (cancelled) return;
        const error =
          cause instanceof Error ? cause : new Error(String(cause));
        // Scream: the picker still works, but a human needs to know the row
        // is gone rather than wonder why the picker changed.
        console.error(
          `[ReferencePicker] ${degradedMessage} ` +
            `Seed ${REFERENCE_PICKER_KNOB_FEATURE}.${key} (migrations/${seedFile}).`,
          error,
        );
        setState({ tokens: [], loading: false, error });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, degradedMessage, seedFile]);

  return state;
}

export function useCommonReferenceTypes(): CommonReferenceTypesState {
  return useReferencePickerTokenList(
    COMMON_TYPES_KNOB_KEY,
    "no curated type tier — showing every type instead.",
    "reference_picker_common_types_knob.sql",
  );
}

/** Tokens the picker never offers (on top of every component type). */
export function useHiddenReferenceTypes(): CommonReferenceTypesState {
  return useReferencePickerTokenList(
    HIDDEN_TYPES_KNOB_KEY,
    "no hidden-types list — offering every reference-pickable type.",
    "reference_picker_hidden_types_knob.sql",
  );
}
