/**
 * Bridge between flashcard domain shapes and FlashcardMobileView.
 */

import { useCallback, useEffect, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import type { CardWithDetails } from "@/features/flashcards/data/types";
import type { ReviewResult } from "@/features/flashcards/types";
import {
  asCardKind,
  CARD_KIND,
  matchingPairs,
  studyFaces,
  type CardKind,
  type MatchingPair,
} from "@/features/flashcards/utils/cardVariants";
import type { NormalizedFlashcard } from "./flashcards-set-derive";
import type { FlashcardSubcard } from "./flashcard-subcards";

export interface FlashcardMobileCard {
  /** The face to show — for cloze cards this is the OCCLUDED text (studyFaces),
   *  never raw `{{c1::…}}` markup; for matching it's the prompt. */
  front: string;
  /** The reveal face — for cloze, the answers revealed (studyFaces). */
  back: string | null;
  id?: string;
  /** Rich card variant. Absent/`basic` → the classic front/back flip. */
  kind?: CardKind;
  /** Matching-card pairs (present only when `kind === 'matching'`). The mobile
   *  view branches to <MatchingCardPlayer> instead of a flip for these. */
  pairs?: MatchingPair[];
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
  return cards.map((card) => {
    const kind = asCardKind(card.card_kind);
    if (kind === CARD_KIND.matching) {
      // Matching cards carry their prompt (front) + pairs; the mobile view
      // renders the shared tap-to-pair player instead of a flip.
      return {
        id: card.id,
        kind,
        front: card.front,
        back: card.back,
        pairs: matchingPairs(card),
      };
    }
    // basic / cloze — flip cards. Cloze faces are occluded/revealed via the
    // SHARED studyFaces (the same source the desktop deck uses), so the front
    // shows blanks instead of raw `{{c1::…}}` markup.
    const faces = studyFaces(card);
    return {
      id: card.id,
      kind,
      front: faces.front,
      back: faces.back,
    };
  });
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
