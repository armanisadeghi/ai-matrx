// lib/scoped-config/useScopedKnobs.ts
//
// THE ONE READ behind every scoped-configuration panel — org configuration
// screens, the user settings tab, and any surface that shows an effective
// value with its provenance. A single `platform.knob_index` RPC returns
// resolution state AND presentation metadata per key, so unlike the HR
// predecessor (useHrKnobs) there is no second metadata read to merge.

"use client";

import { useCallback, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { ReactReduxContext } from "react-redux";

import { fetchKnobIndex } from "./service";
import type { ScopedKnob } from "./types";
import { extractErrorMessage } from "@/utils/errors";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import type { RootState } from "@/lib/redux/store";

/**
 * Whether a signed-in person exists, read from the app store when one is
 * mounted (a bare test harness has none and counts as signed in). A
 * signed-out surface never calls `knob_index` — it needs a caller — so it gets
 * no knobs and no error; its consumers keep their own defaults.
 */
function useSignedIn(): boolean {
  const redux = useContext(ReactReduxContext);
  const store = redux?.store;
  return useSyncExternalStore(
    (listener) => (store ? store.subscribe(listener) : () => {}),
    () => (store ? Boolean(selectUserId(store.getState() as RootState)) : true),
    () => true,
  );
}

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
    if (!signedIn) return;
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
  }, [organizationId, featurePrefix, userId, overriddenOnly, requestKey, generation, signedIn]);

  const current = signedIn && snapshot?.requestKey === requestKey ? snapshot : null;
  const knobs = current?.knobs ?? [];
  const isLoading = signedIn && !current;
  const error = current?.error ?? null;
  const missing = knobs.filter((knob) => knob.origin === "missing");

  return { knobs, isLoading, error, refresh, missing };
}
