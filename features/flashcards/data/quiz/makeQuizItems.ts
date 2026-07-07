// features/flashcards/data/quiz/makeQuizItems.ts
//
// Phase 1B (Test mode) — the `fc_make_quiz_items` agent wrapper
// (AGENT_SPECS.md §8: front, back, topic, distractor_count → question,
// correct, distractors[], explanation). Test mode's PRIMARY distractor
// source is free and instant — other cards' back text from the same set
// (see quiz/buildQuizQuestions.ts) — this agent is only the FALLBACK for
// sets too small to have enough sibling cards to draw from. OPTIONAL: with
// no agent configured (or a failed call) the caller gets `null` and Test
// mode simply ships fewer options for that question — never a hard blocker.

import type { AppDispatch, RootState } from "@/lib/redux/store";
import { launchAgentExecution } from "@/features/agents/redux/execution-system/thunks/launch-agent-execution.thunk";
import {
  selectFirstExtractedObject,
  selectJsonExtractionComplete,
  selectRequestStatus,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { destroyInstanceIfAllowed } from "@/features/agents/redux/execution-system/conversations/conversations.thunks";
import { FC_AGENTS } from "../agents";

export interface MakeQuizItemsArgs {
  front: string;
  back: string;
  topic?: string | null;
  distractorCount: number;
  /** Override the configured `fc_make_quiz_items` agent id (testing only). */
  agentId?: string | null;
}

export interface MakeQuizItemsResult {
  question: string;
  correct: string;
  distractors: string[];
  explanation: string;
}

async function waitForObject(
  getState: () => RootState,
  requestId: string,
  timeoutMs = 45_000,
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

/** Returns AI-generated distractors for one card, or null on any skip/failure. */
export function makeQuizItems(args: MakeQuizItemsArgs) {
  return async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<MakeQuizItemsResult | null> => {
    const agentId = args.agentId ?? FC_AGENTS.makeQuizItems;
    if (!agentId) return null;

    let conversationId: string | null = null;
    try {
      const launch = await dispatch(
        launchAgentExecution({
          agentId,
          surfaceKey: "flashcards-quiz-items",
          sourceFeature: "education-flashcards-review",
          isEphemeral: false,
          runtime: {
            variables: {
              front: args.front,
              back: args.back,
              topic: args.topic ?? "",
              distractor_count: args.distractorCount,
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
      const r = raw as Record<string, unknown>;
      const question = typeof r.question === "string" ? r.question : "";
      const correct = typeof r.correct === "string" ? r.correct : "";
      if (!question || !correct) return null;

      return {
        question,
        correct,
        distractors: Array.isArray(r.distractors)
          ? r.distractors.filter((x): x is string => typeof x === "string")
          : [],
        explanation: typeof r.explanation === "string" ? r.explanation : "",
      };
    } catch (err) {
      console.error("[flashcards.makeQuizItems] failed:", err);
      return null;
    } finally {
      if (conversationId) dispatch(destroyInstanceIfAllowed(conversationId));
    }
  };
}
