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
import { useAgentSlot } from "@/features/agents/slots/useAgentSlot";
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

export interface SlotAgentInstructions {
  /** The resolved agent id, or null while resolving / on failure. */
  agentId: string | null;
  /** The agent's system message, or null while loading / on failure. */
  instructions: string | null;
  loading: boolean;
  /** Set when the slot or the agent row could not be read. */
  error: string | null;
}

/**
 * Resolve a slot and read its agent's instructions from the DB — the canonical
 * way a voice surface learns what its agent says. Never returns a fallback: an
 * unresolved slot or an instruction-less agent surfaces as `error`.
 */
export function useSlotAgentInstructions(
  slotKey: string,
): SlotAgentInstructions {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const { slot, loading: slotLoading, error: slotError } = useAgentSlot(slotKey);
  const agentId = slot?.agentId ?? null;

  const [state, setState] = useState<{
    agentId: string | null;
    instructions: string | null;
    error: string | null;
  }>({ agentId: null, instructions: null, error: null });

  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    void (async () => {
      const existing = (store.getState() as RootState).agentDefinition.agents?.[
        agentId
      ];
      if (!existing) {
        await dispatch(fetchFullAgent(agentId))
          .unwrap()
          .catch(() => {
            /* handled below by the missing-row branch */
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
          `[voice-agent] slot "${slotKey}" resolved to agent ${agentId}, which ${why}.`,
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
  }, [agentId, dispatch, store, slotKey]);

  return {
    agentId,
    instructions: state.agentId === agentId ? state.instructions : null,
    loading: slotLoading || (!!agentId && state.agentId !== agentId),
    error: slotError ?? (state.agentId === agentId ? state.error : null),
  };
}
