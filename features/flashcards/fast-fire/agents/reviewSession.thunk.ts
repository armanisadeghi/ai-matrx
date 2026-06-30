// features/flashcards/fast-fire/agents/reviewSession.thunk.ts
//
// The "professor" end-of-session review (REQUIREMENTS §8, AGENT_SPECS §7,
// fc_review_batch). OPTIONAL (hard-requirement #6): if no review agent is
// configured, this is a clean no-op and the drill completes normally. When the
// agent IS set, it reviews the whole batch together — cross-card patterns,
// systematic misconceptions — and the summary is folded into the slice
// (`setSessionReview`) AND persisted to `study_session.session_review`.
//
// Like grading, this is read-from-Redux-after-resolve, never a same-tick re-read.

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
import { getFastFireAgentConfig } from "../config";
import { setSessionReview } from "../redux/fastFireSlice";
import { selectGradesInOrder, selectFastFireCards } from "../redux/fastFire.selectors";
import { FC_REVIEW_BATCH_SCHEMA } from "./schemas";

interface ReviewSessionArgs {
  sessionId: string | null;
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

/** Run the holistic review. Call WITHOUT awaiting (it catches up after complete). */
export function reviewSession(args: ReviewSessionArgs) {
  return async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<void> => {
    const config = getFastFireAgentConfig();
    if (!config.reviewAgentId) return; // optional lane — clean skip

    const state = getState();
    const cards = selectFastFireCards(state);
    const grades = selectGradesInOrder(state);
    const byId = new Map(grades.map((g) => [g.cardId, g]));

    const attempts = cards.map((c) => {
      const g = byId.get(c.id);
      return {
        front: c.front,
        result: g?.result ?? null,
        score: g?.score ?? null,
        transcript: g?.transcript ?? "",
      };
    });
    const resolved = grades.filter((g) => g.status === "resolved");
    const correct = resolved.filter((g) => g.result === "correct").length;
    const aggregate = {
      total: cards.length,
      graded: resolved.length,
      correct,
      accuracy: resolved.length > 0 ? correct / resolved.length : 0,
    };

    let conversationId: string | null = null;
    try {
      // Launch WITHOUT auto-running (autoRun:false + background) — exactly the
      // grading lane's pattern. With autoRun:true the launch thunk internally
      // executes AND polls to completion (up to 300s) before returning, blocking
      // finalize; autoRun:false returns the conversationId immediately and we run
      // it ourselves so the existing `waitForObject` polling owns the wait.
      const launch = await dispatch(
        launchAgentExecution({
          agentId: config.reviewAgentId,
          surfaceKey: "fastfire-review-session",
          sourceFeature: "flashcards",
          isEphemeral: true,
          runtime: {
            variables: {
              transcript: attempts.map((a) => a.transcript).filter(Boolean).join("\n"),
              attempts,
              aggregate,
              remaining_cards: [],
            },
          },
          config: {
            autoRun: false,
            displayMode: "background",
            llmOverrides: { response_format: FC_REVIEW_BATCH_SCHEMA },
          },
          jsonExtraction: { enabled: true, fuzzyOnFinalize: true },
        }),
      ).unwrap();
      conversationId = launch.conversationId;

      const exec = await dispatch(executeInstance({ conversationId })).unwrap();
      const requestId = exec.requestId;
      if (!requestId) return;

      const raw = await waitForObject(getState, requestId);
      if (!raw || typeof raw !== "object") return;
      const summary = (raw as Record<string, unknown>).summary;
      if (typeof summary !== "string" || summary.length === 0) return;

      dispatch(setSessionReview({ review: summary }));
      if (args.sessionId) {
        await studyService.updateSession(args.sessionId, {
          session_review: raw as never,
        });
      }
    } catch (err) {
      console.error("[fastfire.reviewSession] failed:", err);
    } finally {
      if (conversationId) dispatch(destroyInstanceIfAllowed(conversationId));
    }
  };
}
