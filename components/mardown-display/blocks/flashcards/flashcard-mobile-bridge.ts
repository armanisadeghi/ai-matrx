/**
 * Bridge between flashcard domain shapes and FlashcardMobileView.
 */

import { useCallback, useState } from "react";
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
import type { FaceImageRef } from "./FlashcardFaceImage";
import { getCardImages } from "@/features/flashcards/components/study/cardImages";

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
  /** Face images (fc_detail front_image/back_image) — see FlashcardFaceImage. */
  frontImage?: FaceImageRef;
  backImage?: FaceImageRef;
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
    const images = getCardImages(card);
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
      frontImage: images.front,
      backImage: images.back,
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

/**
 * The phone deck (full-screen swipe mode) for a flashcards block — opened ONLY
 * by the person: the block's own deck button, the "Study in flash mode?"
 * prompt, or an explicit `?mode=flash` link.
 *
 * It used to open ITSELF on every phone the moment a block had cards, so a
 * conversation whose answer held flashcards opened straight into a black
 * full-screen deck instead of the chat (verifier, 2026-09-28,
 * /chat/6c043b28… at 375). A chat opens as a chat; flashcards render inline
 * and become a deck when the person asks. Guard:
 * `__tests__/deck-opens-only-when-asked.test.tsx`.
 */
export function useFlashcardDeckView() {
  const {
    isMobileView,
    setIsMobileView,
    mobileStartIndex,
    setMobileStartIndex,
    enterMobileView,
    exitMobileView: baseExit,
  } = useFlashcardMobileViewState(0);
  const [dismissed, setDismissed] = useState(false);

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
