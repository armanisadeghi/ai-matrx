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
import type { ReviewResult } from "@/features/flashcards/types";
import { getFcTutorAgentConfig } from "./config";

export interface MicroCoachContext {
  front: string;
  back: string;
  result: ReviewResult;
  /** This learner's prior attempts on this card (newest first), if any. */
  priorAttempts?: unknown[];
  agentId?: string | null;
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
      });

      const raw = result.data;
      if (!raw || typeof raw !== "object") return null;
      const tip = (raw as Record<string, unknown>).tip;
      return typeof tip === "string" && tip.trim().length > 0 ? tip : null;
    } catch (err) {
      console.error("[flashcards.microCoach] failed:", err);
      return null;
    }
  };
}
