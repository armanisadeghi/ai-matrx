// features/flashcards/data/tutor/microCoach.ts
//
// Phase 4 stretch (Flashcards Competitive Parity Push) — a cheap/fast-model
// per-card tip, surfaced right after grading (not just end-of-session). New
// OPTIONAL lane (`fc_micro_coach`, AGENT_SPECS.md §9): no live agent is
// registered yet (author one via agent_author, then set the id in
// `tutor/config.ts` / localStorage) — until then `getFcTutorAgentConfig()`
// returns `microCoachAgentId: null` and this cleanly no-ops, same as every
// other optional tutor lane before its agent existed.
//
// Deliberately tiny + fire-and-forget: a wrong answer shouldn't wait on an
// LLM round-trip before the learner can move to the next card, so callers
// should NOT await this before advancing — read the result when it resolves.

import type { AppDispatch, RootState } from "@/lib/redux/store";
import { launchAgentExecution } from "@/features/agents/redux/execution-system/thunks/launch-agent-execution.thunk";
import {
  selectFirstExtractedObject,
  selectJsonExtractionComplete,
  selectRequestStatus,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { destroyInstanceIfAllowed } from "@/features/agents/redux/execution-system/conversations/conversations.thunks";
import type { ReviewResult } from "../../types";
import { getFcTutorAgentConfig } from "./config";

export interface MicroCoachContext {
  front: string;
  back: string;
  result: ReviewResult;
  /** This learner's prior attempts on this card (newest first), if any. */
  priorAttempts?: unknown[];
  agentId?: string | null;
}

async function waitForObject(
  getState: () => RootState,
  requestId: string,
  timeoutMs = 20_000,
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

/** One-line coaching tip after a grade, or null when unconfigured / no-signal. */
export function microCoach(ctx: MicroCoachContext) {
  return async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<string | null> => {
    const agentId = ctx.agentId ?? getFcTutorAgentConfig().microCoachAgentId;
    if (!agentId) return null; // optional lane — no agent authored yet

    let conversationId: string | null = null;
    try {
      const launch = await dispatch(
        launchAgentExecution({
          agentId,
          surfaceKey: "flashcards-micro-coach",
          sourceFeature: "flashcards-coach",
          isEphemeral: false,
          runtime: {
            variables: {
              front: ctx.front,
              back: ctx.back,
              result: ctx.result,
              prior_attempts: ctx.priorAttempts ?? [],
            },
          },
          config: {
            autoRun: true,
            displayMode: "direct",
          },
          jsonExtraction: { enabled: true, fuzzyOnFinalize: true },
        }),
      ).unwrap();
      conversationId = launch.conversationId;
      const requestId = launch.requestId;
      if (!requestId) return null;

      const raw = await waitForObject(getState, requestId);
      if (!raw || typeof raw !== "object") return null;
      const tip = (raw as Record<string, unknown>).tip;
      return typeof tip === "string" && tip.trim().length > 0 ? tip : null;
    } catch (err) {
      console.error("[flashcards.microCoach] failed:", err);
      return null;
    } finally {
      if (conversationId) dispatch(destroyInstanceIfAllowed(conversationId));
    }
  };
}
