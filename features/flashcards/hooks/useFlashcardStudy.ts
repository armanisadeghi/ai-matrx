"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { flashcardPersistenceService } from "../services/flashcardPersistenceService";
import type {
  FlashcardCard,
  FlashcardSetRow,
  CardReviewStats,
  CardStudyState,
  LeitnerBox,
  ReviewResult,
} from "../types";

// ============================================================================
// Spaced repetition: Modified Leitner system (3 boxes)
// ============================================================================

/** Intervals in milliseconds for each Leitner box */
const BOX_INTERVALS: Record<LeitnerBox, number> = {
  1: 0, // Box 1: show every session (always due)
  2: 1 * 24 * 60 * 60 * 1000, // Box 2: 1 day
  3: 3 * 24 * 60 * 60 * 1000, // Box 3: 3 days
};

function computeBox(stats: CardReviewStats): LeitnerBox {
  if (stats.totalReviews === 0) return 1;

  // Look at last result to determine box
  switch (stats.lastResult) {
    case "incorrect":
      return 1;
    case "partial":
      return 2;
    case "correct": {
      // If they've gotten it correct multiple times, promote to box 3
      if (stats.correct >= 2 && stats.incorrect === 0) return 3;
      if (stats.correct > stats.incorrect) return 2;
      return 1;
    }
    default:
      return 1;
  }
}

function isCardDue(stats: CardReviewStats, box: LeitnerBox): boolean {
  if (box === 1) return true; // Always due
  if (!stats.lastReviewedAt) return true;

  const elapsed = Date.now() - new Date(stats.lastReviewedAt).getTime();
  return elapsed >= BOX_INTERVALS[box];
}

function buildStudyStates(cardStats: CardReviewStats[]): CardStudyState[] {
  return cardStats.map((stats) => {
    const box = computeBox(stats);
    return {
      cardIndex: stats.cardIndex,
      box,
      isDue: isCardDue(stats, box),
      lastReviewedAt: stats.lastReviewedAt,
      lastResult: stats.lastResult,
    };
  });
}

// ============================================================================
// Hook
// ============================================================================

interface UseFlashcardStudyOptions {
  cards: FlashcardCard[];
  /** Load an existing set by id (from canvas_items.external_id). */
  setId?: string | null;
  conversationId?: string;
  messageId?: string;
  title?: string;
  /** Auto-save on mount when no setId. Default true. Requires messageId. */
  autoSave?: boolean;
}

interface UseFlashcardStudyReturn {
  /** The persisted set (null until saved/loaded) */
  set: FlashcardSetRow | null;
  /** Per-card review stats */
  cardStats: CardReviewStats[];
  /** Spaced repetition states for each card */
  studyStates: CardStudyState[];
  /** Cards that are due for review, sorted by priority */
  dueCards: CardStudyState[];
  /** Summary stats */
  totalReviews: number;
  masteryPercent: number;
  /** Save the set (called automatically if autoSave) */
  saveSet: () => Promise<FlashcardSetRow | null>;
  /** Submit a review for a card */
  submitReview: (cardIndex: number, result: ReviewResult) => Promise<void>;
  /** Reset all progress */
  resetProgress: () => Promise<void>;
  /** Loading state */
  isLoading: boolean;
  /** Whether set has been persisted */
  isSaved: boolean;
}

export function useFlashcardStudy({
  cards,
  setId,
  conversationId,
  messageId,
  title,
  autoSave = true,
}: UseFlashcardStudyOptions): UseFlashcardStudyReturn {
  const [set, setSet] = useState<FlashcardSetRow | null>(null);
  const [cardStats, setCardStats] = useState<CardReviewStats[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const initRef = useRef(false);

  // Derived state
  const studyStates = buildStudyStates(cardStats);
  const dueCards = studyStates
    .filter((s) => s.isDue)
    .sort((a, b) => a.box - b.box); // Box 1 (learning) first

  const totalReviews = cardStats.reduce((sum, s) => sum + s.totalReviews, 0);
  const masteryPercent =
    cards.length > 0
      ? Math.round(
          (studyStates.filter((s) => s.box === 3).length / cards.length) * 100,
        )
      : 0;

  const saveSet = useCallback(async (): Promise<FlashcardSetRow | null> => {
    if (cards.length === 0) return null;
    if (!messageId) {
      console.warn("[useFlashcardStudy] saveSet skipped — no messageId");
      return null;
    }

    setIsLoading(true);
    try {
      const { data, error } = await flashcardPersistenceService.saveSet({
        cards,
        conversation_id: conversationId,
        message_id: messageId,
        title,
      });

      if (data && !error) {
        setSet(data);

        // Load existing review stats
        const { stats } = await flashcardPersistenceService.getCardStats(
          data.id,
          data.card_count,
        );
        setCardStats(stats);

        return data;
      }
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [cards, conversationId, messageId, title]);

  const submitReview = useCallback(
    async (cardIndex: number, result: ReviewResult) => {
      if (!set) return;

      // Optimistic update
      setCardStats((prev) =>
        prev.map((stat) => {
          if (stat.cardIndex !== cardIndex) return stat;
          return {
            ...stat,
            [result]: stat[result] + 1,
            totalReviews: stat.totalReviews + 1,
            lastReviewedAt: new Date().toISOString(),
            lastResult: result,
          };
        }),
      );

      // Persist
      await flashcardPersistenceService.submitReview({
        set_id: set.id,
        card_index: cardIndex,
        result,
      });
    },
    [set],
  );

  const resetProgress = useCallback(async () => {
    if (!set) return;

    setIsLoading(true);
    try {
      await flashcardPersistenceService.resetReviews(set.id);
      // Reset local stats
      setCardStats(
        Array.from({ length: cards.length }, (_, i) => ({
          cardIndex: i,
          correct: 0,
          partial: 0,
          incorrect: 0,
          totalReviews: 0,
          lastReviewedAt: null,
          lastResult: null,
        })),
      );
    } finally {
      setIsLoading(false);
    }
  }, [set, cards.length]);

  const loadExistingSet = useCallback(async (id: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await flashcardPersistenceService.getSet(id);
      if (data && !error) {
        setSet(data);
        const { stats } = await flashcardPersistenceService.getCardStats(
          data.id,
          data.card_count,
        );
        setCardStats(stats);
        return data;
      }
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Bind to linked set id (artifact path) or auto-save when messageId exists.
  useEffect(() => {
    if (initRef.current) return;
    if (setId) {
      initRef.current = true;
      void loadExistingSet(setId);
      return;
    }
    if (autoSave && cards.length > 0 && messageId) {
      initRef.current = true;
      void saveSet();
    }
  }, [autoSave, cards.length, messageId, setId, saveSet, loadExistingSet]);

  return {
    set,
    cardStats,
    studyStates,
    dueCards,
    totalReviews,
    masteryPercent,
    saveSet,
    submitReview,
    resetProgress,
    isLoading,
    isSaved: set !== null,
  };
}
