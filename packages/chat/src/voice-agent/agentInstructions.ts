// features/voice-agent/agentInstructions.ts
//
// 🚨 THE ONE PLACE A VOICE AGENT'S INSTRUCTIONS ARE READ.
//
// A realtime voice agent's persona is its `agent.definition` row's system
// message — nothing else. This module is the single reader for that, so no
// surface can quietly grow a second answer to "what are this agent's
// instructions?" (which is exactly how a hardcoded copy became the silent
// authority before 2026-08-16).
//
// Since P24v the row is read on the SERVER (`realtimeSession.ts`); the browser
// never fetches the definition. A row with no system message is refused there
// loudly; no caller substitutes a prompt of its own.

import { useEffect } from "react";
import type { AnyMandateKey } from "@ai-matrx/agents/mandates";
import { useMandate } from "../mandates/useMandate";
import { useRealtimeSessionConfig } from "./realtimeSession";

export interface MandateAgentInstructions {
  /** The resolved agent id, or null while resolving / on failure. */
  agentId: string | null;
  /** The agent's system message, or null while loading / on failure. */
  instructions: string | null;
  loading: boolean;
  /** Set when the mandate or the agent row could not be read. */
  error: string | null;
}

/**
 * Resolve a mandate and read its agent's instructions — the canonical way a
 * voice surface learns what its agent says. The definition is read on the
 * server (`POST /ai/agents/{id}/realtime-session`, P24v); the browser never
 * fetches it. Never returns a fallback: an unresolved mandate or an
 * instruction-less agent surfaces as `error` (the server's own sentence).
 */
export function useMandateAgentInstructions(
  mandateKey: AnyMandateKey | "",
): MandateAgentInstructions {
  const { mandate, loading: mandateLoading, error: mandateError } = useMandate(mandateKey);
  const agentId = mandate?.agentId ?? null;
  const session = useRealtimeSessionConfig(agentId);
  const instructions = session.config?.instructions || null;
  const sessionError =
    session.error ?? (session.config && !instructions ? "This agent has no system message." : null);
  useEffect(() => {
    if (!sessionError || !agentId) return;
    console.error(
      `[voice-agent] mandate "${mandateKey}" resolved to agent ${agentId}: ${sessionError}`,
    );
  }, [sessionError, agentId, mandateKey]);
  return {
    agentId,
    instructions,
    loading: mandateLoading || session.loading,
    error: mandateError ?? sessionError,
  };
}
