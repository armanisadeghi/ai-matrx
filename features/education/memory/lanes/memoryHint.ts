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
import {
  coerceMemoryHint,
  type MemoryHintPayload,
} from "@/features/content-ir/kinds/memory-aid";

export interface MemoryHintContext {
  front: string;
  back: string;
  topic?: string | null;
  /**
   * The card this aid belongs to. With it, the aid is persisted as an
   * `fc_detail` layer on arrival (D151) — the same durable slot the sibling
   * EnhanceSetDialog writes its generated layers to — so advancing the card
   * stops destroying it, and it comes back with the card forever after.
   */
  cardId?: string | null;
  /** Live handle — the aid streams where the caller mounts it (never a spinner). */
  onConversationCreated?: (conversationId: string) => void;
}

/** The `fc_detail.metadata.source` tag identifying an aid this lane produced. */
export const MEMORY_HINT_SOURCE = "memory_hint";

/** The `fc_detail.kind` a per-card memory aid is stored under. */
export const MEMORY_HINT_DETAIL_KIND = "mnemonic";

/** Read a persisted memory aid back off an `fc_detail` row (null if it isn't one). */
export function memoryHintFromDetail(detail: {
  kind: string;
  text: string;
  metadata: unknown;
}): MemoryHintPayload | null {
  const meta =
    detail.metadata &&
    typeof detail.metadata === "object" &&
    !Array.isArray(detail.metadata)
      ? (detail.metadata as Record<string, unknown>)
      : {};
  if (meta.source !== MEMORY_HINT_SOURCE) return null;
  return coerceMemoryHint({
    aid: detail.text,
    technique: meta.technique,
    explanation: meta.explanation,
  });
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
        // 🚨 D151 — persist on arrival, inside the primitive. The learner
        // advances cards while this runs, and the button's own reset effect
        // (`[front, back]`) wiped the payload the moment they did.
        ...(ctx.cardId
          ? {
              onResult: async (run) => {
                const hint = coerceMemoryHint(run.data);
                if (!hint) return;
                const { fcService } = await import(
                  "@/features/flashcards/data/fcService"
                );
                const saved = await fcService.addDetail(
                  ctx.cardId as string,
                  MEMORY_HINT_DETAIL_KIND,
                  hint.aid,
                  {
                    generated_by: "agent",
                    metadata: {
                      source: MEMORY_HINT_SOURCE,
                      technique: hint.technique,
                      explanation: hint.explanation,
                    },
                  },
                );
                if (saved.error) {
                  console.error(
                    "[memory.memoryHint] aid generated but NOT saved:",
                    saved.error,
                  );
                }
              },
            }
          : {}),
      });
      return coerceMemoryHint(result.data);
    } catch (err) {
      console.error("[memory.memoryHint] failed:", err);
      return null;
    }
  };
}
