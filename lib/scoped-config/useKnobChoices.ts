"use client";

// lib/scoped-config/useKnobChoices.ts
//
// The React face of `knobChoices` (see `./choices` for why this exists at all):
// one setting's registry row, read through the door the app already uses, with
// its choices already carrying the registry's own words.
//
// A screen renders `choices` and nothing else. It does not declare them, it
// does not prettify a token, and while the row has not arrived it renders
// nothing rather than an empty control — `problem` is the sentence when the
// read failed, and it is never collapsed into "there are no choices".

import { useEffect, useState } from "react";

import { knobChoices, type KnobChoice } from "./choices";
import { fetchKnobDefinition } from "./service";
import type { ScopedKnob } from "./types";

export type KnobChoicesRead = {
  /** The registry row, once it has arrived. */
  knob: ScopedKnob | null;
  /** The choices to render, in the registry's order. Empty until it arrives. */
  choices: KnobChoice[];
  /** True while the read is in flight. */
  loading: boolean;
  /** The sentence to show when the read failed or the key has no row. */
  problem: string | null;
};

export function useKnobChoices(
  organizationId: string | null | undefined,
  ref: { feature: string; key: string },
  userId?: string | null,
): KnobChoicesRead {
  const [knob, setKnob] = useState<ScopedKnob | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { feature, key } = ref;

  useEffect(() => {
    if (!organizationId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setProblem(null);
    void fetchKnobDefinition({
      organizationId,
      feature,
      key,
      userId: userId ?? undefined,
    })
      .then((row) => {
        if (cancelled) return;
        setKnob(row);
        setProblem(
          row
            ? null
            : `The setting ${feature}.${key} has no entry in the settings registry, so its choices cannot be shown.`,
        );
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setProblem(
          `The choices for this setting could not be read — ${error instanceof Error ? error.message : String(error)}`,
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, feature, key, userId]);

  return {
    knob,
    choices: knob ? knobChoices(knob) : [],
    loading,
    problem,
  };
}
