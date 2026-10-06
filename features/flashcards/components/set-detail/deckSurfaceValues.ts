// features/flashcards/components/set-detail/deckSurfaceValues.ts
//
// The ONE builder of a deck's surface values (`set_details`, `card_count`, `cards`) for
// `matrx-user/education-flashcard-set` and every surface that inherits from it — the deck
// page and the study modes (Applets AP-6: the study page sent no deck at all). One shape,
// one function: a second mapping would drift.

import type { CardWithDetails, FcSetRow } from "../../data/types";
import type {
  FlashcardSetSurfaceCard,
  FlashcardSetSurfaceDetails,
} from "@/features/surfaces/manifests/education-flashcard-set.manifest";
import { asCardKind, CARD_KIND, matchingPairs } from "../../utils/cardVariants";

export function deckSurfaceDetails(set: FcSetRow): FlashcardSetSurfaceDetails {
  return {
    name: set.name,
    topic: set.topic,
    lesson: set.lesson,
    description: set.description,
    difficulty: set.difficulty,
    visibility: set.visibility,
  };
}

export function deckSurfaceCards(cards: readonly CardWithDetails[]): FlashcardSetSurfaceCard[] {
  return cards.map((card, index) => ({
    id: card.id,
    position: card.position ?? index,
    card_kind: asCardKind(card.card_kind),
    front: card.front,
    back: card.back,
    pairs: asCardKind(card.card_kind) === CARD_KIND.matching ? matchingPairs(card) : null,
    detail_layers: card.details.map((detail) => ({
      kind: detail.kind,
      text: detail.text,
      generation_status: detail.generation_status,
    })),
  }));
}
