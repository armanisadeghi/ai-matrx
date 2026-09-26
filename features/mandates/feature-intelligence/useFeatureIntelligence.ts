"use client";

import { useEffect, useState } from "react";
import { onMandateCacheInvalidated } from "../service";
import { fetchFeatureIntelligence } from "./service";
import { targetPrefixes } from "./placement";
import {
  fetchRegisteredPlacesForFeature,
  keepVisibleJobs,
  mergePlaces,
  resolveDeclaredPlaces,
} from "./places";
import type {
  FeatureIntelligenceRow,
  IntelligenceContext,
  IntelligenceLevel,
  ResolvedPlace,
} from "./types";

export interface FeatureIntelligenceState {
  rows: FeatureIntelligenceRow[];
  places: ResolvedPlace[];
  loading: boolean;
  error: string | null;
  /** A failed read of registered places — the declared ones still show. */
  placesError: string | null;
}

/**
 * One feature's jobs and places for a seat. Re-reads whenever any binding is
 * written (the resolution cache's invalidation), so an action on this page
 * shows its result without a reload.
 */
export function useFeatureIntelligence(args: {
  feature: string;
  level: IntelligenceLevel;
  organizationId: string | null;
  userId: string | null;
  context: IntelligenceContext;
  /** False while the seat is still being worked out. */
  enabled: boolean;
}): FeatureIntelligenceState {
  const { feature, level, organizationId, userId, enabled } = args;
  const contextKey = JSON.stringify(args.context);
  const [epoch, setEpoch] = useState(0);
  const [state, setState] = useState<FeatureIntelligenceState>({
    rows: [],
    places: [],
    loading: true,
    error: null,
    placesError: null,
  });

  useEffect(() => onMandateCacheInvalidated(() => setEpoch((n) => n + 1)), []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const context = JSON.parse(contextKey) as IntelligenceContext;
    setState((prev) => ({ ...prev, loading: prev.rows.length === 0, error: null }));
    (async () => {
      try {
        // The jobs and the registered screens are read side by side: the
        // screens are asked by the target's key prefixes, then kept to the
        // jobs this viewer can see (which are already only this target's).
        const [rows, registeredAnswer] = await Promise.all([
          fetchFeatureIntelligence({ feature, level, organizationId, userId }),
          fetchRegisteredPlacesForFeature(targetPrefixes(feature) ?? [], context).then(
            (places) => ({ places, error: null as string | null }),
            (error: unknown) => ({
              places: [] as ResolvedPlace[],
              error: error instanceof Error ? error.message : String(error),
            }),
          ),
        ]);
        const declared = resolveDeclaredPlaces(feature, context);
        const visible = new Set(rows.map((row) => row.mandateKey));
        const registered = keepVisibleJobs(registeredAnswer.places, visible);
        const placesError = registeredAnswer.error;
        if (cancelled) return;
        setState({
          rows,
          places: mergePlaces(declared, registered),
          loading: false,
          error: null,
          placesError,
        });
      } catch (error) {
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          loading: false,
          error: error instanceof Error ? error.message : String(error),
        }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [feature, level, organizationId, userId, contextKey, enabled, epoch]);

  return state;
}
