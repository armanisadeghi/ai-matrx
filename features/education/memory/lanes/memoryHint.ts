// features/education/memory/lanes/memoryHint.ts
//
// VISION §11 "Proactive suggestions" — a cheap/fast per-card memory aid, surfaced
// on demand next to the flashcard the learner is studying. Mirrors the tutor's
// microCoach lane exactly (fire-and-forget thunk, ephemeral cleanup, best-effort
// null on any failure) so it never blocks the study flow.
//
// Deliberately opt-in: nothing fires unless the learner taps "Memory aid" on the
// card — this thunk is only dispatched from that tap, never automatically.

import type { AppDispatch, RootState } from "@/lib/redux/store";
import { launchAgentExecution } from "@/features/agents/redux/execution-system/thunks/launch-agent-execution.thunk";
import {
  selectFirstExtractedObject,
  selectJsonExtractionComplete,
  selectRequestStatus,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { destroyInstanceIfAllowed } from "@/features/agents/redux/execution-system/conversations/conversations.thunks";
import { EDU_MEMORY_AGENTS } from "../agents";
import { coerceMemoryHint, type MemoryHintPayload } from "../types";

export interface MemoryHintContext {
  front: string;
  back: string;
  topic?: string | null;
}

async function waitForObject(
  getState: () => RootState,
  requestId: string,
  timeoutMs = 25_000,
): Promise<unknown | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = getState();
    if (selectJsonExtractionComplete(requestId)(state)) {
      return selectFirstExtractedObject(requestId)(state)?.value ?? null;
    }
    if (selectRequestStatus(requestId)(state) === "error") {
      return selectFirstExtractedObject(requestId)(state)?.value ?? null;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}

/** One memory aid for the current card, or null on failure / no signal. */
export function memoryHint(ctx: MemoryHintContext) {
  return async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<MemoryHintPayload | null> => {
    let conversationId: string | null = null;
    try {
      const launch = await dispatch(
        launchAgentExecution({
          agentId: EDU_MEMORY_AGENTS.memoryHint,
          surfaceKey: "flashcards-memory-hint",
          // A background per-card study aid on a study surface — the exact
          // meaning of the existing "coach" lane tag.
          sourceFeature: "education-flashcards-coach",
          isEphemeral: false,
          runtime: {
            variables: {
              front: ctx.front,
              back: ctx.back,
              topic: ctx.topic ?? "",
            },
          },
          config: { autoRun: true, displayMode: "direct" },
          jsonExtraction: { enabled: true, fuzzyOnFinalize: true },
        }),
      ).unwrap();
      conversationId = launch.conversationId;
      const requestId = launch.requestId;
      if (!requestId) return null;

      const raw = await waitForObject(getState, requestId);
      return coerceMemoryHint(raw);
    } catch (err) {
      console.error("[memory.memoryHint] failed:", err);
      return null;
    } finally {
      if (conversationId) dispatch(destroyInstanceIfAllowed(conversationId));
    }
  };
}
