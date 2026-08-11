// features/education/tutor/lanes/reviewSession.ts
//
// Phase 4 (Flashcards Competitive Parity Push) — the mode-agnostic
// end-of-session "professor" review (`fc_review_batch`, AGENT_SPECS.md §7),
// generalized out of Fast Fire so it can run at the end of ANY completed
// study session (classic set study, adaptive due review, weak-area drill),
// not just Fast Fire — writing `study_session.session_review` the same way,
// so `CoachReviewPanel` + `SessionScorecard` on the session detail page
// display it for free everywhere, with zero per-surface UI work.
//
// OPTIONAL: with no review agent configured this is a clean no-op.
// The agent round-trip runs through the canonical headless primitive
// (`runHeadlessAgentJson`, D126) — this lane only owns variables, coercion,
// and the session_review persist.

import type { AppDispatch, RootState } from "@/lib/redux/store";
import {
  livePosture,
  runHeadlessAgentJson,
} from "@/features/agents/redux/execution-system/thunks/run-headless-agent-json";
import { studyService } from "@/features/education/study/service/studyService";
import { getFcTutorAgentConfig } from "./config";
import type { ReviewAggregate, ReviewAttempt } from "./learnerContext";

export interface ReviewSessionArgs {
  sessionId: string | null;
  attempts: ReviewAttempt[];
  aggregate: ReviewAggregate;
  /** Override the configured `fc_review_batch` agent id (rare — testing only). */
  agentId?: string | null;
  /** Live handle — the review streams where the caller mounts it. */
  onConversationCreated?: (conversationId: string) => void;
}

export interface ReviewSessionResult {
  summary: string;
  strengths: string[];
  weaknesses: string[];
}

/**
 * Run the holistic review AND persist it to `study_session.session_review`.
 * Returns the parsed result for surfaces that want to show it inline (the
 * completion screen); returns null on a clean skip/failure — the session
 * still completed fine, this is a value-add, never a blocker.
 */
export function reviewSession(args: ReviewSessionArgs) {
  return async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<ReviewSessionResult | null> => {
    const agentId = args.agentId ?? getFcTutorAgentConfig().reviewAgentId;
    if (!agentId) return null; // optional lane — clean skip
    if (args.attempts.length === 0) return null; // nothing to review

    try {
      const result = await runHeadlessAgentJson(dispatch, getState, {
        agentId,
        surfaceKey: "flashcards-review-session",
        sourceFeature: "education-flashcards",
        ...livePosture(args.onConversationCreated),
        variables: {
          transcript: args.attempts
            .map((a) => a.transcript)
            .filter(Boolean)
            .join("\n"),
          attempts: args.attempts,
          aggregate: args.aggregate,
          remaining_cards: [],
        },
        timeoutMs: 120_000,
        pollIntervalMs: 200,
      });

      // Partial-tolerant: an errored stream may still carry a usable object.
      const raw = result.data;
      if (!raw || typeof raw !== "object") return null;
      const r = raw as Record<string, unknown>;
      const summary = typeof r.summary === "string" ? r.summary : "";
      if (!summary) return null;

      if (args.sessionId) {
        await studyService.updateSession(args.sessionId, {
          session_review: raw as never,
        });
      }

      return {
        summary,
        strengths: Array.isArray(r.strengths)
          ? r.strengths.filter((x): x is string => typeof x === "string")
          : [],
        weaknesses: Array.isArray(r.weaknesses)
          ? r.weaknesses.filter((x): x is string => typeof x === "string")
          : [],
      };
    } catch (err) {
      console.error("[flashcards.reviewSession] failed:", err);
      return null;
    }
  };
}
