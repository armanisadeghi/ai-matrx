// features/admin/spend/useSpendExplorerKnobs.ts
//
// The five org-configurable lines behind the explorer's "dig here" signals
// (law 6: opinions become knobs). Seeded by `migrations/spend_explorer_knobs.sql`:
//
//   platform.spend_explorer.context_heavy_tokens  default 200000
//   platform.spend_explorer.iteration_heavy       default 10
//   platform.spend_explorer.spike_multiplier      default 3
//   platform.spend_explorer.hog_share_pct         default 5
//   platform.spend_explorer.repeat_burst          default 5
//
// The client resolves them (with organization overrides) and passes them to
// `admin_spend_breakdown`, which RAISES when one is missing. `knobNumber`
// throws on a missing row — deliberately no fallback; the explorer surfaces
// the failure instead of guessing where a line sits.
//
// Doc: features/admin/spend/FEATURE.md

"use client";

import { useEffect, useState } from "react";

import { knobInt, knobNumber } from "@/lib/knobs/featureKnobs";

import type { SpendExplorerThresholds } from "./types";

export const SPEND_EXPLORER_KNOB_FEATURE = "platform.spend_explorer";

export interface SpendExplorerKnobsState {
  thresholds: SpendExplorerThresholds | null;
  loading: boolean;
  error: Error | null;
}

export function useSpendExplorerKnobs(): SpendExplorerKnobsState {
  const [state, setState] = useState<SpendExplorerKnobsState>({
    thresholds: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [contextHeavyTokens, iterationHeavy, spikeMultiplier, hogSharePct, repeatBurst] =
          await Promise.all([
            knobInt(SPEND_EXPLORER_KNOB_FEATURE, "context_heavy_tokens"),
            knobInt(SPEND_EXPLORER_KNOB_FEATURE, "iteration_heavy"),
            knobNumber(SPEND_EXPLORER_KNOB_FEATURE, "spike_multiplier"),
            knobNumber(SPEND_EXPLORER_KNOB_FEATURE, "hog_share_pct"),
            knobInt(SPEND_EXPLORER_KNOB_FEATURE, "repeat_burst"),
          ]);
        if (cancelled) return;
        setState({
          thresholds: {
            contextHeavyTokens,
            iterationHeavy,
            spikeMultiplier,
            hogSharePct,
            repeatBurst,
          },
          loading: false,
          error: null,
        });
      } catch (cause) {
        if (cancelled) return;
        setState({
          thresholds: null,
          loading: false,
          error:
            cause instanceof Error
              ? cause
              : new Error("Could not read the spend explorer knobs."),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
