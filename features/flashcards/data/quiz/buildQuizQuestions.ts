// features/flashcards/data/quiz/buildQuizQuestions.ts
//
// Phase 1B (Test mode) — turns a set's cards into multiple-choice questions
// using OTHER cards in the same set as distractors (free, instant, always
// plausible-ish since they're from the same topic/set). `needsFallback`
// flags questions that came up short (small sets) for the AI fallback
// (`makeQuizItems`) to top up on demand.

import type { CardWithDetails } from "../types";

export const QUIZ_DISTRACTOR_COUNT = 3;

export interface QuizQuestion {
  cardId: string;
  front: string;
  correctAnswer: string;
  /** Shuffled; always includes `correctAnswer`. */
  options: string[];
  /** True when the set didn't have enough distinct sibling answers. */
  needsFallback: boolean;
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

    return {
      cardId: card.id,
      front: card.front,
      correctAnswer: card.back,
      options: shuffle([card.back, ...siblingDistractors]),
      needsFallback: siblingDistractors.length < QUIZ_DISTRACTOR_COUNT,
    };
  });
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
