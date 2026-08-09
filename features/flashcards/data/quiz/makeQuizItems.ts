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
import { runHeadlessAgentJson } from "@/features/agents/redux/execution-system/thunks/run-headless-agent-json";
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

/** Returns AI-generated distractors for one card, or null on any skip/failure. */
export function makeQuizItems(args: MakeQuizItemsArgs) {
  return async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<MakeQuizItemsResult | null> => {
    const agentId = args.agentId ?? FC_AGENTS.makeQuizItems;
    if (!agentId) return null;

    try {
      const result = await runHeadlessAgentJson(dispatch, getState, {
        agentId,
        surfaceKey: "flashcards-quiz-items",
        sourceFeature: "education-flashcards",
        variables: {
          front: args.front,
          back: args.back,
          topic: args.topic ?? "",
          distractor_count: args.distractorCount,
        },
        timeoutMs: 45_000,
        pollIntervalMs: 150,
      });
      const raw = result.data;
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
    }
  };
}
