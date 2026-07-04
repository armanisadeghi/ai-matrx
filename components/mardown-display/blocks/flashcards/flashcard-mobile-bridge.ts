/**
 * Bridge between flashcard domain shapes and FlashcardMobileView.
 */

import { useCallback, useEffect, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import type { CardWithDetails } from "@/features/flashcards/data/types";
import type { ReviewResult } from "@/features/flashcards/types";
import type { NormalizedFlashcard } from "./flashcards-set-parts";
import type { FlashcardSubcard } from "./flashcard-subcards";

export interface FlashcardMobileCard {
  front: string;
  back: string | null;
  id?: string;
}

export function toFlashcardMobileCards(
  cards: Array<
    | NormalizedFlashcard
    | FlashcardSubcard
    | { front?: string | null; back?: string | null; id?: string }
  >,
): FlashcardMobileCard[] {
  return cards.map((card, index) => ({
    front: card.front ?? "",
    back: card.back ?? null,
    id: "id" in card && typeof card.id === "string" ? card.id : `card-${index}`,
  }));
}

export function toFlashcardMobileCardsFromStudy(
  cards: CardWithDetails[],
): FlashcardMobileCard[] {
  return cards.map((card) => ({
    front: card.front,
    back: card.back,
    id: card.id,
  }));
}

export function studyResultsByIndex(
  cards: CardWithDetails[],
  resultsByCard: Record<string, ReviewResult | undefined>,
): Record<number, ReviewResult | undefined> {
  const out: Record<number, ReviewResult | undefined> = {};
  cards.forEach((card, i) => {
    out[i] = resultsByCard[card.id];
  });
  return out;
}

export function useFlashcardMobileViewState(initialIndex = 0) {
  const [isMobileView, setIsMobileView] = useState(false);
  const [mobileStartIndex, setMobileStartIndex] = useState(initialIndex);

  const enterMobileView = useCallback((index = 0) => {
    setMobileStartIndex(index);
    setIsMobileView(true);
  }, []);

  const exitMobileView = useCallback(() => {
    setIsMobileView(false);
  }, []);

  return {
    isMobileView,
    setIsMobileView,
    mobileStartIndex,
    setMobileStartIndex,
    enterMobileView,
    exitMobileView,
  };
}

/** Auto-open swipe mode on phones once cards are ready (user can exit). */
export function useAutoFlashcardMobileView(
  cardCount: number,
  options?: { enabled?: boolean; isComplete?: boolean },
) {
  const isMobile = useIsMobile();
  const enabled = options?.enabled ?? true;
  const {
    isMobileView,
    setIsMobileView,
    mobileStartIndex,
    setMobileStartIndex,
    enterMobileView,
    exitMobileView: baseExit,
  } = useFlashcardMobileViewState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!enabled || !isMobile || dismissed || cardCount === 0) return;
    if (options?.isComplete === false) return;
    enterMobileView(0);
  }, [
    enabled,
    isMobile,
    dismissed,
    cardCount,
    options?.isComplete,
    enterMobileView,
  ]);

  const exitMobileView = useCallback(() => {
    setDismissed(true);
    baseExit();
  }, [baseExit]);

  return {
    isMobileView,
    setIsMobileView,
    mobileStartIndex,
    setMobileStartIndex,
    enterMobileView,
    exitMobileView,
    dismissed,
  };
}
