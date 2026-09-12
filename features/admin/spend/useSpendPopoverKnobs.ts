// features/admin/spend/useSpendPopoverKnobs.ts
//
// The two org-configurable opinions behind the spend surfaces (law 6: opinions
// become knobs). Seeded by `migrations/spend_popover_knobs.sql`:
//
//   platform.spend_popover.times_per_day        default 1   (0 = off)
//   platform.spend_popover.scare_threshold_usd  default 100
//
// `knobNumber` throws when a knob row is missing — there is deliberately no
// fallback, because a silently-assumed cadence is exactly the kind of invisible
// default this system does not allow. Callers surface the failure.
//
// Doc: features/admin/spend/FEATURE.md

"use client";

import { useEffect, useState } from "react";

import { knobInt, knobNumber } from "@/lib/knobs/featureKnobs";

export const SPEND_POPOVER_KNOB_FEATURE = "platform.spend_popover";

export interface SpendPopoverKnobs {
  timesPerDay: number;
  scareThresholdUsd: number;
}

export interface SpendPopoverKnobsState {
  knobs: SpendPopoverKnobs | null;
  loading: boolean;
  error: Error | null;
}

export function useSpendPopoverKnobs(): SpendPopoverKnobsState {
  const [state, setState] = useState<SpendPopoverKnobsState>({
    knobs: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [timesPerDay, scareThresholdUsd] = await Promise.all([
          knobInt(SPEND_POPOVER_KNOB_FEATURE, "times_per_day"),
          knobNumber(SPEND_POPOVER_KNOB_FEATURE, "scare_threshold_usd"),
        ]);
        if (cancelled) return;
        setState({
          knobs: { timesPerDay, scareThresholdUsd },
          loading: false,
          error: null,
        });
      } catch (cause) {
        if (cancelled) return;
        setState({
          knobs: null,
          loading: false,
          error:
            cause instanceof Error
              ? cause
              : new Error("Could not read the spend popover knobs."),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
