// lib/scoped-config/useScopedKnobs.ts
//
// THE ONE READ behind every scoped-configuration panel — org configuration
// screens, the user settings tab, and any surface that shows an effective
// value with its provenance. A single `platform.knob_index` RPC returns
// resolution state AND presentation metadata per key, so unlike the HR
// predecessor (useHrKnobs) there is no second metadata read to merge.

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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
  const [knobs, setKnobs] = useState<ScopedKnob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);

  const refresh = useCallback(() => setGeneration((n) => n + 1), []);

  useEffect(() => {
    if (!organizationId) {
      setKnobs([]);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchKnobIndex({
          organizationId,
          featurePrefix,
          userId,
          overriddenOnly,
        });
        if (!cancelled) {
          setKnobs(rows);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId, featurePrefix, userId, overriddenOnly, generation]);

  const missing = useMemo(
    () => knobs.filter((knob) => knob.origin === "missing"),
    [knobs],
  );

  return { knobs, isLoading, error, refresh, missing };
}
