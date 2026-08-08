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
  const [state, setState] = useState<AgentSlotState>({
    slot: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    setState({ slot: null, loading: true, error: null });
    resolveAgentSlot(slotKey)
      .then((slot) => {
        if (!cancelled) setState({ slot, loading: false, error: null });
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[agent-slots] ${slotKey} failed to resolve:`, message);
        if (!cancelled) setState({ slot: null, loading: false, error: message });
      });
    return () => {
      cancelled = true;
    };
  }, [slotKey]);

  return state;
}
