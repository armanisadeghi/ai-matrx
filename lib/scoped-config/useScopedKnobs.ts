// lib/scoped-config/useScopedKnobs.ts
//
// THE ONE READ behind every scoped-configuration panel — org configuration
// screens, the user settings tab, and any surface that shows an effective
// value with its provenance. A single `platform.knob_index` RPC returns
// resolution state AND presentation metadata per key, so unlike the HR
// predecessor (useHrKnobs) there is no second metadata read to merge.

"use client";

import { useCallback, useEffect, useState } from "react";

import { fetchKnobIndex } from "./service";
import type { ScopedKnob } from "./types";

export type ScopedKnobsValue = {
  knobs: ScopedKnob[];
  /** True while the FIRST read is in flight; a refresh keeps last data on screen. */
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
  /** Keys whose origin is `missing` — render these as hard errors, never blanks. */
  missing: ScopedKnob[];
};

export function useScopedKnobs(options: {
  organizationId: string | null | undefined;
  featurePrefix?: string;
  userId?: string;
  overriddenOnly?: boolean;
}): ScopedKnobsValue {
  const { organizationId, featurePrefix, userId, overriddenOnly } = options;
  // Mask old configuration synchronously when ANY resolver input changes.
  // An effect-only reset briefly exposes the previous user's/org's policy.
  const requestKey = JSON.stringify([organizationId, featurePrefix, userId, overriddenOnly]);
  const [snapshot, setSnapshot] = useState<{
    requestKey: string;
    knobs: ScopedKnob[];
    isLoading: boolean;
    error: string | null;
  } | null>(null);
  const [generation, setGeneration] = useState(0);
  const refresh = useCallback(() => setGeneration((n) => n + 1), []);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    void fetchKnobIndex({ organizationId, featurePrefix, userId, overriddenOnly })
      .then((knobs) => {
        if (!cancelled) setSnapshot({ requestKey, knobs, isLoading: false, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) setSnapshot({ requestKey, knobs: [], isLoading: false,
          error: err instanceof Error ? err.message : String(err) });
      });
    return () => { cancelled = true; };
  }, [organizationId, featurePrefix, userId, overriddenOnly, requestKey, generation]);

  const current = organizationId && snapshot?.requestKey === requestKey ? snapshot : null;
  const knobs = current?.knobs ?? [];
  const isLoading = Boolean(organizationId) && !current;
  const error = current?.error ?? null;
  const missing = knobs.filter((knob) => knob.origin === "missing");

  return { knobs, isLoading, error, refresh, missing };
}
