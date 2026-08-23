// features/flashcards/data/quiz/makeQuizItems.ts
//
// Phase 1B (Test mode) — the `fc_make_quiz_items` agent wrapper
// (AGENT_SPECS.md §8: front, back, topic, distractor_count → question,
// correct, distractors[], explanation). Test mode's PRIMARY distractor
// source is free and instant — other cards' back text from the same set
// (see quiz/buildQuizQuestions.ts) — this lane is only the FALLBACK for
// sets too small to have enough sibling cards to draw from. Best-effort: on
// any failure the caller gets `null` and Test mode simply ships fewer
// options for that question — never a hard blocker.

import type { AppDispatch, RootState } from "@/lib/redux/store";
import { runHeadlessAgentJson } from "@/features/agents/redux/execution-system/thunks/run-headless-agent-json";
import { FC_MANDATES } from "../mandates";
import { QUIZ_ITEMS_KEY } from "./buildQuizQuestions";

export interface MakeQuizItemsArgs {
  front: string;
  back: string;
  topic?: string | null;
  distractorCount: number;
  /**
   * The card these items are for. With it, the COMPLETE result — stem, correct
   * answer, distractors, explanation — is written to
   * `fc_card.dynamic_content.quiz_items` on arrival (D151). Before that, only
   * `distractors` survived, in memory, so every future quiz over the same deck
   * paid for the same items again.
   */
  cardId?: string | null;
  /** Override the quiz-items mandate (testing only). */
  mandateKey?: string | null;
}

export interface MakeQuizItemsResult {
  question: string;
  correct: string;
  distractors: string[];
  explanation: string;
}

/** Narrow the agent's raw JSON (the `quiz_item` kind — `__kind` ignored) to
 *  the lane's contract (shared with the persistence seam). */
export function readItems(data: unknown): MakeQuizItemsResult | null {
  if (!data || typeof data !== "object") return null;
  const r = data as Record<string, unknown>;
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
}

/** Returns AI-generated distractors for one card, or null on any skip/failure. */
export function makeQuizItems(args: MakeQuizItemsArgs) {
  return async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<MakeQuizItemsResult | null> => {
    const mandateKey = args.mandateKey ?? FC_MANDATES.makeQuizItems;

    try {
      const result = await runHeadlessAgentJson(dispatch, getState, {
        mandateKey,
        surfaceKey: "flashcards-quiz-items",
        sourceFeature: "education-flashcards",
        surfaceName: "matrx-user/education-flashcards",
        variables: {
          front: args.front,
          back: args.back,
          topic: args.topic ?? "",
          distractor_count: args.distractorCount,
        },
        timeoutMs: 45_000,
        pollIntervalMs: 150,
        // 🚨 D151 — persist the WHOLE result on arrival. This lane fires from a
        // mount effect on the question being shown; the learner advancing (or
        // leaving) used to throw away everything but the distractors, in memory.
        ...(args.cardId
          ? {
              onResult: async (run) => {
                const items = readItems(run.data);
                if (!items || items.distractors.length === 0) return;
                const { fcService } = await import("../fcService");
                const saved = await fcService.mergeCardJson(
                  args.cardId as string,
                  "dynamic_content",
                  (current) => ({
                    ...current,
                    [QUIZ_ITEMS_KEY]: {
                      question: items.question,
                      correct: items.correct,
                      distractors: items.distractors,
                      explanation: items.explanation,
                      generated_at: new Date().toISOString(),
                    },
                  }),
                );
                if (saved.error) {
                  console.error(
                    "[flashcards.makeQuizItems] items generated but NOT saved:",
                    saved.error,
                  );
                }
              },
            }
          : {}),
      });
      return readItems(result.data);
    } catch (err) {
      console.error("[flashcards.makeQuizItems] failed:", err);
      return null;
    }
  };
}
