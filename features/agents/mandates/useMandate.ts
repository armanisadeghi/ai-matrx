"use client";

/** React hook over resolveMandate — see service.ts for the resolution
 * doctrine. Loud: `error` set means the mandate could not resolve; the consumer
 * disables its affordance and shows the message, never falls back to a
 * hardcoded agent id. Re-resolves automatically when the mandate's cache is
 * invalidated (a binding was saved/removed via the mandate picker or /agents/mandates). */

import { useEffect, useState } from "react";
import {
  onMandateCacheInvalidated,
  resolveMandate,
  type ResolvedMandate,
} from "./service";
import { extractErrorMessage } from "@/utils/errors";

export interface MandateState {
  mandate: ResolvedMandate | null;
  loading: boolean;
  error: string | null;
}

export function useMandate(mandateKey: string): MandateState {
  const [state, setState] = useState<
    MandateState & { key: string; epoch: number }
  >({
    key: mandateKey,
    epoch: 0,
    mandate: null,
    loading: true,
    error: null,
  });

  // Reset for a new mandate key during render (the documented adjust-state-on-
  // prop-change pattern) — never synchronously inside the effect.
  if (state.key !== mandateKey) {
    setState({
      key: mandateKey,
      epoch: 0,
      mandate: null,
      loading: true,
      error: null,
    });
  }

  // Bump the epoch when this mandate's cached resolution is invalidated so the
  // resolve effect re-runs (e.g. the user just saved an override).
  useEffect(() => {
    return onMandateCacheInvalidated((invalidatedKey) => {
      if (invalidatedKey === undefined || invalidatedKey === mandateKey) {
        setState((prev) => ({ ...prev, epoch: prev.epoch + 1, loading: true }));
      }
    });
  }, [mandateKey]);

  const epoch = state.epoch;
  useEffect(() => {
    let cancelled = false;
    resolveMandate(mandateKey)
      .then((mandate) => {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            key: mandateKey,
            mandate,
            loading: false,
            error: null,
          }));
        }
      })
      .catch((error: unknown) => {
        const message = extractErrorMessage(error);
        console.error(`[mandates] ${mandateKey} failed to resolve:`, message);
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            key: mandateKey,
            mandate: null,
            loading: false,
            error: message,
          }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [mandateKey, epoch]);

  return { mandate: state.mandate, loading: state.loading, error: state.error };
}
