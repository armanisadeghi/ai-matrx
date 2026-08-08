"use client";

/** React hook over resolveAgentSlot — see service.ts for the resolution
 * doctrine. Loud: `error` set means the slot could not resolve; the consumer
 * disables its affordance and shows the message, never falls back to a
 * hardcoded agent id. Re-resolves automatically when the slot's cache is
 * invalidated (a binding was saved/removed via the slot picker or /agents/slots). */

import { useEffect, useState } from "react";
import {
  onSlotCacheInvalidated,
  resolveAgentSlot,
  type ResolvedClientSlot,
} from "./service";

export interface AgentSlotState {
  slot: ResolvedClientSlot | null;
  loading: boolean;
  error: string | null;
}

export function useAgentSlot(slotKey: string): AgentSlotState {
  const [state, setState] = useState<AgentSlotState & { key: string; epoch: number }>({
    key: slotKey,
    epoch: 0,
    slot: null,
    loading: true,
    error: null,
  });

  // Reset for a new slot key during render (the documented adjust-state-on-
  // prop-change pattern) — never synchronously inside the effect.
  if (state.key !== slotKey) {
    setState({ key: slotKey, epoch: 0, slot: null, loading: true, error: null });
  }

  // Bump the epoch when this slot's cached resolution is invalidated so the
  // resolve effect re-runs (e.g. the user just saved an override).
  useEffect(() => {
    return onSlotCacheInvalidated((invalidatedKey) => {
      if (invalidatedKey === undefined || invalidatedKey === slotKey) {
        setState((prev) => ({ ...prev, epoch: prev.epoch + 1, loading: true }));
      }
    });
  }, [slotKey]);

  const epoch = state.epoch;
  useEffect(() => {
    let cancelled = false;
    resolveAgentSlot(slotKey)
      .then((slot) => {
        if (!cancelled) {
          setState((prev) => ({ ...prev, key: slotKey, slot, loading: false, error: null }));
        }
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[agent-slots] ${slotKey} failed to resolve:`, message);
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            key: slotKey,
            slot: null,
            loading: false,
            error: message,
          }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [slotKey, epoch]);

  return { slot: state.slot, loading: state.loading, error: state.error };
}
