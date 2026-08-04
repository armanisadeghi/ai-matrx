// features/education/tutor/lanes/helpLive.ts
//
// Phase 4 (Flashcards Competitive Parity Push) — the mode-agnostic "I'm
// confused" live help lane (`fc_help_live`, AGENT_SPECS.md §6), generalized
// out of Fast Fire so EVERY study surface (classic set study, adaptive due
// review, weak-area drill, Fast Fire) can offer the same AI tutor with real
// learner context, not a stub. OPTIONAL: with no help agent configured the
// caller gets `null` and the UI shows a "not configured" hint — the study
// session is unaffected.
//
// Ephemeral + read-after-resolve, exactly like the Fast-Fire-only version this
// replaces: nothing is persisted, the answer surfaces transiently.

import type { AppDispatch, RootState } from "@/lib/redux/store";
import { launchAgentExecution } from "@/features/agents/redux/execution-system/thunks/launch-agent-execution.thunk";
import {
  selectFirstExtractedObject,
  selectJsonExtractionComplete,
  selectRequestStatus,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { destroyInstanceIfAllowed } from "@/features/agents/redux/execution-system/conversations/conversations.thunks";
import { getFcTutorAgentConfig } from "./config";
import {
  coerceTrustEnvelope,
  type TrustEnvelope,
} from "@/features/education/trust/types";

export interface HelpLiveContext {
  front: string;
  back: string;
  /** The learner's question; defaults to a generic "I'm confused" prompt. */
  question?: string;
  /** 0..1 session accuracy so far, or null before anything is graded. */
  sessionScore?: number | null;
  /** Front text of recently-correct cards THIS session, most-recent-first. */
  recentCorrect?: string[];
  /** Front text of recently-missed cards THIS session, most-recent-first. */
  recentWrong?: string[];
  /** Distinct topics the learner is currently struggling with. */
  struggledTopics?: string[];
  /** How many items are due for review right now, across the learner's sets. */
  dueCount?: number;
  /** Milliseconds spent on this card before asking. */
  timeOnCardMs?: number;
  /** This learner's past attempts on THIS card (newest first). */
  cardHistory?: unknown[];
  /** Override the configured `fc_help_live` agent id (rare — testing only). */
  agentId?: string | null;
}

export interface HelpLiveResult {
  answer: string;
  hintLevel: "nudge" | "partial" | "full";
  followups: string[];
  /** P0 TrustEnvelope — how grounded this answer is; null on refusal render
   *  the honest-refusal presentation instead of a normal answer bubble. */
  trust: TrustEnvelope | null;
}

async function waitForObject(
  getState: () => RootState,
  requestId: string,
  timeoutMs = 60_000,
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
    await new Promise((r) => setTimeout(r, 150));
  }
  return null;
}

/** Returns help, or null when no help agent is configured / it failed. */
export function helpLive(ctx: HelpLiveContext) {
  return async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<HelpLiveResult | null> => {
    const agentId = ctx.agentId ?? getFcTutorAgentConfig().helpAgentId;
    if (!agentId) return null; // optional lane

    let conversationId: string | null = null;
    try {
      const launch = await dispatch(
        launchAgentExecution({
          agentId,
          surfaceKey: "flashcards-help-live",
          // NOT ephemeral (see docs/EPHEMERAL_AGENT_RUNS_SPEC.md); kept out of
          // normal chats via a distinct system source_feature (source-registry.ts).
          sourceFeature: "education-flashcards",
          isEphemeral: false,
          runtime: {
            userInput:
              ctx.question?.trim() || "I'm confused — help me with this card.",
            variables: {
              front: ctx.front,
              back: ctx.back,
              session_score: ctx.sessionScore ?? 0,
              recent_correct: ctx.recentCorrect ?? [],
              recent_wrong: ctx.recentWrong ?? [],
              struggled_topics: ctx.struggledTopics ?? [],
              due_count: ctx.dueCount ?? 0,
              time_on_card_ms: ctx.timeOnCardMs ?? 0,
              card_history: ctx.cardHistory ?? [],
            },
          },
          config: {
            autoRun: true,
            displayMode: "direct",
            // No response_format override: fc_help_live is OUR agent — its output
            // shape lives in its DB definition (edit via agent_author, never a
            // call-time override, which also wrecks the prod agent cache).
          },
          jsonExtraction: { enabled: true, fuzzyOnFinalize: true },
        }),
      ).unwrap();
      conversationId = launch.conversationId;
      const requestId = launch.requestId;
      if (!requestId) return null;

      const raw = await waitForObject(getState, requestId);
      if (!raw || typeof raw !== "object") return null;
      const r = raw as Record<string, unknown>;
      const answer = typeof r.answer === "string" ? r.answer : "";
      if (!answer) return null;
      const hintLevel =
        r.hint_level === "nudge" ||
        r.hint_level === "partial" ||
        r.hint_level === "full"
          ? r.hint_level
          : "partial";
      return {
        answer,
        hintLevel,
        followups: Array.isArray(r.followups)
          ? r.followups.filter((x): x is string => typeof x === "string")
          : [],
        trust: coerceTrustEnvelope(r.trust),
      };
    } catch (err) {
      console.error("[flashcards.helpLive] failed:", err);
      return null;
    } finally {
      if (conversationId) dispatch(destroyInstanceIfAllowed(conversationId));
    }
  };
}
