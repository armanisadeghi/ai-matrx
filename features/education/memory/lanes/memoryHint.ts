// features/education/memory/lanes/memoryHint.ts
//
// VISION §11 "Proactive suggestions" — a cheap/fast per-card memory aid, surfaced
// on demand next to the flashcard the learner is studying. Mirrors the tutor's
// microCoach lane exactly (fire-and-forget thunk, best-effort null on any
// failure) so it never blocks the study flow. The round-trip runs through the
// canonical headless primitive (`runHeadlessAgentJson`, D126).
//
// Deliberately opt-in: nothing fires unless the learner taps "Memory aid" on the
// card — this thunk is only dispatched from that tap, never automatically.

import type { AppDispatch, RootState } from "@/lib/redux/store";
import {
  livePosture,
  runHeadlessAgentJson,
} from "@/features/agents/redux/execution-system/thunks/run-headless-agent-json";
import { EDU_MEMORY_AGENTS } from "../agents";
import { coerceMemoryHint, type MemoryHintPayload } from "../types";

export interface MemoryHintContext {
  front: string;
  back: string;
  topic?: string | null;
  /** Live handle — the aid streams where the caller mounts it (never a spinner). */
  onConversationCreated?: (conversationId: string) => void;
}

/** One memory aid for the current card, or null on failure / no signal. */
export function memoryHint(ctx: MemoryHintContext) {
  return async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<MemoryHintPayload | null> => {
    try {
      const result = await runHeadlessAgentJson(dispatch, getState, {
        agentId: EDU_MEMORY_AGENTS.memoryHint,
        surfaceKey: "flashcards-memory-hint",
        // A background per-card study aid on a study surface — the exact
        // meaning of the existing "coach" lane tag.
        sourceFeature: "education-flashcards",
        surfaceName: "matrx-user/education-flashcards",
        ...livePosture(ctx.onConversationCreated),
        variables: {
          front: ctx.front,
          back: ctx.back,
          topic: ctx.topic ?? "",
        },
        timeoutMs: 25_000,
        pollIntervalMs: 100,
      });
      return coerceMemoryHint(result.data);
    } catch (err) {
      console.error("[memory.memoryHint] failed:", err);
      return null;
    }
  };
}
