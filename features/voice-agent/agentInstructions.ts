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
// It returns "" when the row carries no system message. Callers report that
// loudly and refuse to run; none of them substitutes a prompt of its own.

import { useEffect, useState } from "react";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { fetchFullAgent } from "@/features/agents/redux/agent-definition/thunks";
import { selectAgentReadyForBuilder } from "@/features/agents/redux/agent-definition/selectors";
import { useMandate } from "@/features/agents/mandates/useMandate";
import type { RootState } from "@/lib/redux/store";

/** The agent row's system message, or "" when it has none. */
export function readInstructionsFromAgent(messages: unknown): string {
  if (!Array.isArray(messages) || messages.length === 0) return "";
  const sys = (messages as Array<{ role?: string; content?: unknown }>).find(
    (m) => m?.role === "system",
  );
  if (!sys || !Array.isArray(sys.content)) return "";
  const text = (sys.content as Array<{ type?: string; text?: unknown }>).find(
    (b) => b?.type === "text",
  )?.text;
  return typeof text === "string" ? text : "";
}

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
 * Resolve a mandate and read its agent's instructions from the DB — the canonical
 * way a voice surface learns what its agent says. Never returns a fallback: an
 * unresolved mandate or an instruction-less agent surfaces as `error`.
 */
export function useMandateAgentInstructions(
  mandateKey: string,
): MandateAgentInstructions {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const { mandate, loading: mandateLoading, error: mandateError } = useMandate(mandateKey);
  const agentId = mandate?.agentId ?? null;

  const [state, setState] = useState<{
    agentId: string | null;
    instructions: string | null;
    error: string | null;
  }>({ agentId: null, instructions: null, error: null });

  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    void (async () => {
      // Gate on the record's FETCH STATUS, never on field presence. A cheap
      // list fetch (`fetchAgentsListFull`, which any agent picker on the page
      // triggers) merges a PARTIAL record carrying no `messages` — treating
      // that as loaded reads the instructions as empty and reports a perfectly
      // healthy agent as broken. The slice states this rule in
      // agent-definition/selectors.ts; `selectAgentReadyForBuilder` is the
      // authoritative "this record has messages" signal.
      if (!selectAgentReadyForBuilder(store.getState() as RootState, agentId)) {
        await dispatch(fetchFullAgent(agentId))
          .unwrap()
          .catch(() => {
            /* handled below by the missing-instructions branch */
          });
      }
      if (cancelled) return;
      const agent = (store.getState() as RootState).agentDefinition.agents?.[
        agentId
      ];
      const instructions = agent
        ? readInstructionsFromAgent(agent.messages)
        : "";
      if (!instructions) {
        const why = agent ? "has no system message" : "could not be loaded";
        console.error(
          `[voice-agent] mandate "${mandateKey}" resolved to agent ${agentId}, which ${why}.`,
        );
        setState({
          agentId,
          instructions: null,
          error: `This agent ${why}.`,
        });
        return;
      }
      setState({ agentId, instructions, error: null });
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId, dispatch, store, mandateKey]);

  return {
    agentId,
    instructions: state.agentId === agentId ? state.instructions : null,
    loading: mandateLoading || (!!agentId && state.agentId !== agentId),
    error: mandateError ?? (state.agentId === agentId ? state.error : null),
  };
}
