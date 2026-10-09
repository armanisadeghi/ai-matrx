// lib/scoped-config/useScopedKnobs.ts
//
// THE ONE READ behind every scoped-configuration panel — org configuration
// screens, the user settings tab, and any surface that shows an effective
// value with its provenance. A single `platform.knob_index` RPC returns
// resolution state AND presentation metadata per key, so unlike the HR
// predecessor (useHrKnobs) there is no second metadata read to merge.

"use client";

import { useCallback, useEffect, useState } from "react";
import { useSignedIn } from "./useSignedIn";

import { fetchKnobIndex } from "./service";
import type { ScopedKnob } from "./types";
import { extractErrorMessage } from "@/utils/errors";

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
  /** `false` asks for nothing and reports nothing loading — the caller has no demand yet. */
  enabled?: boolean;
}): ScopedKnobsValue {
  const { organizationId, featurePrefix, userId, overriddenOnly, enabled = true } = options;
  const signedIn = useSignedIn();
  // Mask old configuration synchronously when ANY resolver input changes.
  // An effect-only reset briefly exposes the previous user's/org's policy.
  const requestKey = JSON.stringify([organizationId, featurePrefix, userId, overriddenOnly, signedIn]);
  const [snapshot, setSnapshot] = useState<{
    requestKey: string;
    knobs: ScopedKnob[];
    isLoading: boolean;
    error: string | null;
  } | null>(null);
  const [generation, setGeneration] = useState(0);
  const refresh = useCallback(() => setGeneration((n) => n + 1), []);

  useEffect(() => {
    // 🚨 A KNOB NEVER BLOCKS A READ: with no organization the index is asked
    // with a null organization and answers the platform defaults (the user and
    // organization layers are skipped). A selected organization still adds its
    // own layer.
    if (!signedIn || !enabled) return;
    let cancelled = false;
    void fetchKnobIndex({ organizationId: organizationId ?? null, featurePrefix, userId, overriddenOnly })
      .then((knobs) => {
        if (!cancelled) setSnapshot({ requestKey, knobs, isLoading: false, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) setSnapshot({ requestKey, knobs: [], isLoading: false,
          error: extractErrorMessage(err) });
      });
    return () => { cancelled = true; };
  }, [organizationId, featurePrefix, userId, overriddenOnly, requestKey, generation, signedIn, enabled]);

  const current = signedIn && enabled && snapshot?.requestKey === requestKey ? snapshot : null;
  const knobs = current?.knobs ?? [];
  const isLoading = signedIn && enabled && !current;
  const error = current?.error ?? null;
  const missing = knobs.filter((knob) => knob.origin === "missing");

  return { knobs, isLoading, error, refresh, missing };
}
