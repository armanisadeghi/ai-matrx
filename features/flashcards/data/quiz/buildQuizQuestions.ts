// features/flashcards/data/quiz/buildQuizQuestions.ts
//
// Phase 1B (Test mode) — turns a set's cards into multiple-choice questions
// using OTHER cards in the same set as distractors (free, instant, always
// plausible-ish since they're from the same topic/set). `needsFallback`
// flags questions that came up short (small sets) for the AI fallback
// (`makeQuizItems`) to top up on demand.

import type { Json } from "@/types/database.types";
import type { CardWithDetails } from "../types";

export const QUIZ_DISTRACTOR_COUNT = 3;

/**
 * The key on `fc_card.dynamic_content` where a card's AI-authored quiz items
 * live (FOUND_DEFECTS D151). `dynamic_content` is the existing home for a rich
 * card variant's structured payload — never a parallel table.
 *
 * Everything the `fc_make_quiz_items` agent produced is kept, not just the
 * distractors: its purpose-written question stem, its restatement of the
 * correct answer, and its explanation were all being dropped at the coercion
 * boundary, so every future quiz over the same deck re-paid for them.
 */
export const QUIZ_ITEMS_KEY = "quiz_items";

/** The persisted payload, exactly as it is written to `dynamic_content.quiz_items`. */
export interface StoredQuizItems {
  question: string;
  correct: string;
  distractors: string[];
  explanation: string;
  generated_at: string;
}

/** Read a card's stored quiz items (null when it has none / they're malformed). */
export function readStoredQuizItems(
  dynamicContent: Json | null | undefined,
): StoredQuizItems | null {
  if (
    !dynamicContent ||
    typeof dynamicContent !== "object" ||
    Array.isArray(dynamicContent)
  ) {
    return null;
  }
  const raw = (dynamicContent as Record<string, unknown>)[QUIZ_ITEMS_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const distractors = Array.isArray(row.distractors)
    ? row.distractors.filter((d): d is string => typeof d === "string")
    : [];
  if (distractors.length === 0) return null;
  return {
    question: typeof row.question === "string" ? row.question : "",
    correct: typeof row.correct === "string" ? row.correct : "",
    distractors,
    explanation: typeof row.explanation === "string" ? row.explanation : "",
    generated_at: typeof row.generated_at === "string" ? row.generated_at : "",
  };
}

export interface QuizQuestion {
  cardId: string;
  front: string;
  correctAnswer: string;
  /** Shuffled; always includes `correctAnswer`. */
  options: string[];
  /** True when the set didn't have enough distinct sibling answers. */
  needsFallback: boolean;
  /**
   * The AI-authored question stem, when this card has one. Preferred over the
   * raw card front — it is what the agent was paid to write. Empty when the
   * question came purely from sibling cards.
   */
  aiQuestion: string;
  /** The AI's explanation of the correct answer, shown after answering. */
  explanation: string;
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

export function buildQuizQuestions(cards: CardWithDetails[]): QuizQuestion[] {
  const allBacks = cards.map((c) => c.back);

  return cards.map((card) => {
    const correctNorm = normalize(card.back);
    const seen = new Set<string>([correctNorm]);
    const siblingDistractors: string[] = [];

    for (const back of shuffle(allBacks)) {
      const norm = normalize(back);
      if (seen.has(norm)) continue;
      seen.add(norm);
      siblingDistractors.push(back);
      if (siblingDistractors.length >= QUIZ_DISTRACTOR_COUNT) break;
    }

    const base: QuizQuestion = {
      cardId: card.id,
      front: card.front,
      correctAnswer: card.back,
      options: shuffle([card.back, ...siblingDistractors]),
      needsFallback: siblingDistractors.length < QUIZ_DISTRACTOR_COUNT,
      aiQuestion: "",
      explanation: "",
    };

    // A card this deck already paid to have quiz items written for never pays
    // again — the stored payload is folded in exactly like a fresh agent run.
    const stored = readStoredQuizItems(card.dynamic_content);
    return stored ? applyStoredQuizItems(base, stored) : base;
  });
}

/** Fold a card's stored quiz items into its question (the no-re-pay path). */
export function applyStoredQuizItems(
  question: QuizQuestion,
  stored: StoredQuizItems,
): QuizQuestion {
  const merged = mergeFallbackDistractors(question, stored.distractors);
  return {
    ...merged,
    aiQuestion: stored.question,
    explanation: stored.explanation,
  };
}

/** Merge AI-generated distractors into an existing question's options,
 *  deduping against what's already there and re-shuffling. */
export function mergeFallbackDistractors(
  question: QuizQuestion,
  extraDistractors: string[],
): QuizQuestion {
  const seen = new Set(question.options.map(normalize));
  const additions = extraDistractors.filter((d) => {
    const norm = normalize(d);
    if (seen.has(norm)) return false;
    seen.add(norm);
    return true;
  });
  if (additions.length === 0) return { ...question, needsFallback: false };
  return {
    ...question,
    options: shuffle([...question.options, ...additions]),
    needsFallback: false,
  };
}
