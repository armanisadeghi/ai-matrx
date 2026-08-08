"use client";

/** React hook over resolveAgentSlot — see service.ts for the resolution
 * doctrine. Loud: `error` set means the slot could not resolve; the consumer
 * disables its affordance and shows the message, never falls back to a
 * hardcoded agent id. */

import { useEffect, useState } from "react";
import { resolveAgentSlot, type ResolvedClientSlot } from "./service";

export interface AgentSlotState {
  slot: ResolvedClientSlot | null;
  loading: boolean;
  error: string | null;
}

export function useAgentSlot(slotKey: string): AgentSlotState {
  const [state, setState] = useState<AgentSlotState & { key: string }>({
    key: slotKey,
    slot: null,
    loading: true,
    error: null,
  });

  // Reset for a new slot key during render (the documented adjust-state-on-
  // prop-change pattern) — never synchronously inside the effect.
  if (state.key !== slotKey) {
    setState({ key: slotKey, slot: null, loading: true, error: null });
  }

  useEffect(() => {
    let cancelled = false;
    resolveAgentSlot(slotKey)
      .then((slot) => {
        if (!cancelled) setState({ key: slotKey, slot, loading: false, error: null });
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[agent-slots] ${slotKey} failed to resolve:`, message);
        if (!cancelled) {
          setState({ key: slotKey, slot: null, loading: false, error: message });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [slotKey]);

  return { slot: state.slot, loading: state.loading, error: state.error };
}
