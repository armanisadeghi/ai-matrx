// features/education/tutor/lanes/microCoach.ts
//
// Phase 4 stretch (Flashcards Competitive Parity Push) — a cheap/fast-model
// per-card tip, surfaced right after grading (not just end-of-session). New
// OPTIONAL lane (`fc_micro_coach`, AGENT_SPECS.md §11): no live agent is
// registered yet (author one via agent_author, then set the id in
// `tutor/config.ts` / localStorage) — until then `getFcTutorAgentConfig()`
// returns `microCoachAgentId: null` and this cleanly no-ops, same as every
// other optional tutor lane before its agent existed.
//
// Deliberately tiny + fire-and-forget: a wrong answer shouldn't wait on an
// LLM round-trip before the learner can move to the next card, so callers
// should NOT await this before advancing — read the result when it resolves.
// The round-trip itself runs through the canonical headless primitive
// (`runHeadlessAgentJson`, D126).

import type { AppDispatch, RootState } from "@/lib/redux/store";
import { runHeadlessAgentJson } from "@/features/agents/redux/execution-system/thunks/run-headless-agent-json";
import { studyService } from "@/features/education/study/service/studyService";
import type { ReviewResult } from "@/features/flashcards/types";
import { getFcTutorAgentConfig } from "./config";

export interface MicroCoachContext {
  front: string;
  back: string;
  result: ReviewResult;
  /** The card this tip is about — the key it is journalled under. */
  cardId: string;
  /**
   * The open `study_session` this grade belongs to. With it, the tip lands in
   * `study_session.metadata.ai.coachTips` the instant it arrives (D151) — the
   * learner can re-read every tip from the session afterwards instead of having
   * one 8-second toast and nothing else. Omit ONLY for a sessionless surface.
   */
  sessionId?: string | null;
  /** This learner's prior attempts on this card (newest first), if any. */
  priorAttempts?: unknown[];
  agentId?: string | null;
}

/** The tip text this lane's agent produced, or null when there is no signal. */
function readTip(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const tip = (data as Record<string, unknown>).tip;
  return typeof tip === "string" && tip.trim().length > 0 ? tip : null;
}

/** One-line coaching tip after a grade, or null when unconfigured / no-signal. */
export function microCoach(ctx: MicroCoachContext) {
  return async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<string | null> => {
    const agentId = ctx.agentId ?? getFcTutorAgentConfig().microCoachAgentId;
    if (!agentId) return null; // optional lane — no agent authored yet

    try {
      const result = await runHeadlessAgentJson(dispatch, getState, {
        agentId,
        surfaceKey: "flashcards-micro-coach",
        sourceFeature: "education-flashcards",
        // Fires automatically right after a grade lands — not a user gesture.
        initiation: "auto",
        variables: {
          front: ctx.front,
          back: ctx.back,
          result: ctx.result,
          prior_attempts: ctx.priorAttempts ?? [],
        },
        timeoutMs: 20_000,
        pollIntervalMs: 100,
        // 🚨 D151 — this lane fires on EVERY graded card and the learner has
        // almost certainly advanced by the time it answers. Persist on arrival,
        // inside the primitive, so the tip survives the card that triggered it.
        ...(ctx.sessionId
          ? {
              onResult: async (run) => {
                const tip = readTip(run.data);
                if (!tip) return;
                const saved = await studyService.appendSessionArtifact(
                  ctx.sessionId as string,
                  {
                    kind: "coachTip",
                    entry: {
                      cardId: ctx.cardId,
                      result: ctx.result,
                      tip,
                      at: new Date().toISOString(),
                    },
                  },
                );
                if (saved.error) {
                  console.error(
                    "[flashcards.microCoach] tip generated but NOT saved:",
                    saved.error,
                  );
                }
              },
            }
          : {}),
      });

      return readTip(result.data);
    } catch (err) {
      console.error("[flashcards.microCoach] failed:", err);
      return null;
    }
  };
}
