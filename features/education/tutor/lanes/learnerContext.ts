// features/education/tutor/lanes/learnerContext.ts
//
// Phase 4 — pure helpers that turn a study surface's already-loaded state
// (cards, this-session results, mastery) into the REAL learner-context
// variables `fc_help_live` and `fc_review_batch` expect (AGENT_SPECS.md §6-7)
// — replacing the long-standing `recent_correct: []` / `struggled_topics: []`
// stubs with actual signal. No network calls in here: due-count and
// per-card attempt history are fetched by the caller (studyService) since
// they need I/O; this module only reshapes state already in memory.

import type { CardWithDetails } from "@/features/flashcards/data/types";
import type { ReviewResult } from "@/features/flashcards/types";
import type { ItemMasteryRow } from "@/features/education/study/types";

export interface RecentSessionContext {
  recentCorrect: string[];
  recentWrong: string[];
  struggledTopics: string[];
}

const RECENT_WINDOW = 5;

/**
 * Walks this session's graded cards (in deck order, most-recent-first) to
 * produce up-to-`RECENT_WINDOW` front-text samples per bucket, plus the
 * distinct topics of cards that are flagged struggling (via `item_mastery`)
 * or were graded incorrect more than once this session.
 */
export function buildRecentSessionContext(
  cards: CardWithDetails[],
  resultsByCard: Record<string, ReviewResult | undefined>,
  masteryByCard: Record<string, ItemMasteryRow | undefined>,
): RecentSessionContext {
  const recentCorrect: string[] = [];
  const recentWrong: string[] = [];
  const struggledTopics = new Set<string>();
  const wrongCountByTopic = new Map<string, number>();

  // Newest-first so "recent" really means recent, not first-in-deck.
  for (let i = cards.length - 1; i >= 0; i--) {
    const card = cards[i];
    const result = resultsByCard[card.id];
    if (result === undefined) continue;

    if (result === "correct" && recentCorrect.length < RECENT_WINDOW) {
      recentCorrect.push(card.front);
    } else if (result !== "correct" && recentWrong.length < RECENT_WINDOW) {
      recentWrong.push(card.front);
    }

    const mastery = masteryByCard[card.id];
    if (mastery?.struggle_flag && card.topic) {
      struggledTopics.add(card.topic);
    }
    if (result !== "correct" && card.topic) {
      const n = (wrongCountByTopic.get(card.topic) ?? 0) + 1;
      wrongCountByTopic.set(card.topic, n);
      if (n >= 2) struggledTopics.add(card.topic);
    }
  }

  return {
    recentCorrect,
    recentWrong,
    struggledTopics: Array.from(struggledTopics),
  };
}

/** `fc_review_batch`'s `attempts` shape (AGENT_SPECS.md §7). */
export interface ReviewAttempt {
  front: string;
  result: ReviewResult | null;
  score: number | null;
  transcript: string;
}

/** Every graded card this session, in deck order — the review batch's input. */
export function buildReviewAttempts(
  cards: CardWithDetails[],
  resultsByCard: Record<string, ReviewResult | undefined>,
  masteryByCard: Record<string, ItemMasteryRow | undefined>,
): ReviewAttempt[] {
  return cards
    .filter((c) => resultsByCard[c.id] !== undefined)
    .map((c) => {
      const result = resultsByCard[c.id] ?? null;
      const mastery = masteryByCard[c.id];
      const score =
        result === "correct" ? 1 : result === "partial" ? 0.5 : 0;
      return {
        front: c.front,
        result,
        score: mastery?.retrievability != null ? Number(mastery.retrievability) : score,
        transcript: "",
      };
    });
}

/** `fc_review_batch`'s `aggregate` shape. */
export interface ReviewAggregate {
  total: number;
  graded: number;
  correct: number;
  accuracy: number;
}

export function buildReviewAggregate(
  attempts: ReviewAttempt[],
  total: number,
): ReviewAggregate {
  const correct = attempts.filter((a) => a.result === "correct").length;
  return {
    total,
    graded: attempts.length,
    correct,
    accuracy: attempts.length > 0 ? correct / attempts.length : 0,
  };
}
