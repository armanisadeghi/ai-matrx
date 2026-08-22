"use client";

/**
 * useResponseModeAgents — resolves the response-mode strip's mandates
 * (`RESPONSE_MODE_MANDATE_MAP`) for the current user in one pass and answers
 * the two questions both `ResponseModeButtons` ask: which agent does a mode
 * open, and which mode is active for the selected agent. The ONE consumer of
 * the map — both strips read it here, so the resolution posture is identical.
 */

import { useMandateSet } from "@/features/agents/mandates/useMandateSet";
import {
  RESPONSE_MODE_MANDATE_MAP,
  RESPONSE_MODES,
  type ResponseMode,
} from "./local-agents";

export interface ResponseModeState {
  mode: ResponseMode;
  /** The mandate key this mode resolves through; null for placeholder modes. */
  mandateKey: string | null;
  /** The resolved agent id, or null while loading / when unresolved / placeholder. */
  agentId: string | null;
  loading: boolean;
  /** Set when the mode's mandate could not resolve — the button is disabled with this reason. */
  error: string | null;
}

const MAPPED_KEYS: readonly string[] = Array.from(
  new Set(
    RESPONSE_MODES.map((mode) => RESPONSE_MODE_MANDATE_MAP[mode]).filter(
      (key): key is string => key !== null,
    ),
  ),
);

export function useResponseModeAgents(): {
  modes: readonly ResponseModeState[];
  /** The first mode whose resolved agent matches — how the strip derives its active pill. */
  modeForAgent: (agentId: string | null | undefined) => ResponseMode | null;
} {
  const mandates = useMandateSet(MAPPED_KEYS);

  const modes: ResponseModeState[] = RESPONSE_MODES.map((mode) => {
    const mandateKey = RESPONSE_MODE_MANDATE_MAP[mode];
    if (!mandateKey) {
      return {
        mode,
        mandateKey: null,
        agentId: null,
        loading: false,
        error: null,
      };
    }
    const state = mandates[mandateKey];
    return {
      mode,
      mandateKey,
      agentId: state?.mandate?.agentId ?? null,
      loading: state?.loading ?? true,
      error: state?.error ?? null,
    };
  });

  const modeForAgent = (
    agentId: string | null | undefined,
  ): ResponseMode | null => {
    if (!agentId) return null;
    return modes.find((m) => m.agentId === agentId)?.mode ?? null;
  };

  return { modes, modeForAgent };
}
