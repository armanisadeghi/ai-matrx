// features/flashcards/data/tutor/reviewSession.ts
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
// Read-from-Redux-after-resolve, never a same-tick re-read — same discipline
// as the grading lane.

import type { AppDispatch, RootState } from "@/lib/redux/store";
import { launchAgentExecution } from "@/features/agents/redux/execution-system/thunks/launch-agent-execution.thunk";
import { executeInstance } from "@/features/agents/redux/execution-system/thunks/execute-instance.thunk";
import {
  selectFirstExtractedObject,
  selectJsonExtractionComplete,
  selectRequestStatus,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { destroyInstanceIfAllowed } from "@/features/agents/redux/execution-system/conversations/conversations.thunks";
import { studyService } from "@/features/education/study/service/studyService";
import { getFcTutorAgentConfig } from "./config";
import type { ReviewAggregate, ReviewAttempt } from "./learnerContext";

export interface ReviewSessionArgs {
  sessionId: string | null;
  attempts: ReviewAttempt[];
  aggregate: ReviewAggregate;
  /** Override the configured `fc_review_batch` agent id (rare — testing only). */
  agentId?: string | null;
}

export interface ReviewSessionResult {
  summary: string;
  strengths: string[];
  weaknesses: string[];
}

async function waitForObject(
  getState: () => RootState,
  requestId: string,
  timeoutMs = 120_000,
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
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
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

    let conversationId: string | null = null;
    try {
      // Launch WITHOUT auto-running (autoRun:false + background), then run it
      // ourselves so `waitForObject` polling owns the wait — mirrors the
      // grading lane's pattern (see fast-fire/agents/gradeCard.thunk.ts).
      const launch = await dispatch(
        launchAgentExecution({
          agentId,
          surfaceKey: "flashcards-review-session",
          sourceFeature: "education-flashcards-review",
          isEphemeral: false,
          runtime: {
            variables: {
              transcript: args.attempts
                .map((a) => a.transcript)
                .filter(Boolean)
                .join("\n"),
              attempts: args.attempts,
              aggregate: args.aggregate,
              remaining_cards: [],
            },
          },
          config: {
            autoRun: false,
            displayMode: "background",
            // No response_format / llmOverrides: fc_review_batch is OUR agent.
          },
          jsonExtraction: { enabled: true, fuzzyOnFinalize: true },
        }),
      ).unwrap();
      conversationId = launch.conversationId;

      const exec = await dispatch(executeInstance({ conversationId })).unwrap();
      const requestId = exec.requestId;
      if (!requestId) return null;

      const raw = await waitForObject(getState, requestId);
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
    } finally {
      if (conversationId) dispatch(destroyInstanceIfAllowed(conversationId));
    }
  };
}
