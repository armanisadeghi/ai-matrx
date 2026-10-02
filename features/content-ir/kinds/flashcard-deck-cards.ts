/**
 * `flashcard_deck_cards_v1` (+ item `flashcard_card_ref_v1`) — every card of
 * ONE deck as an AI step reads it: the card's id and both faces, in deck order.
 *
 * WHY IT EXISTS. A deck-wide AI step (first customer: the
 * `flashcards.fix_giveaway_cards` mandate, Arman 2026-10-02 — "the model gets
 * the cards and then provides updates for any that have it where the back
 * gives away the front") is OFFERED the whole deck as one structured value.
 * A provision value typed as generic `json` is an undeclared shape and the
 * aidream ratchet refuses new ones, so the value is this registered kind.
 * The ids are what the agent copies into `list_change_proposal_v1` `row_id`s,
 * which is why `flashcard_set` (no ids) is not this shape.
 *
 * DATA-ONLY. It is an input contract: nothing renders it as a block, so it has
 * no component, no skill and no bridge (the shape doctor marks those cells n/a).
 *
 * Canonical JSON:
 *   { "__kind":"flashcard_deck_cards_v1",
 *     "cards":[ { "__kind":"flashcard_card_ref_v1", "id":"…",
 *                 "front":"…", "back":"…" } ] }
 */

import type { KindDefinition, KindSchema } from "@ai-matrx/content-ir";

export const FLASHCARD_DECK_CARDS_KIND = "flashcard_deck_cards_v1";
export const FLASHCARD_CARD_REF_KIND = "flashcard_card_ref_v1";

export const flashcardCardRefKindSchema: KindSchema = {
  kind: FLASHCARD_CARD_REF_KIND,
  fields: {
    id: {
      type: "string",
      required: true,
      description:
        "The card's id. Copy it exactly when proposing a change to this card.",
    },
    front: {
      type: "string",
      required: true,
      description: "The card's front, as stored: markdown with LaTeX math.",
    },
    back: {
      type: "string",
      required: true,
      description: "The card's back, as stored: markdown with LaTeX math.",
    },
  },
};

export const flashcardDeckCardsKindSchema: KindSchema = {
  kind: FLASHCARD_DECK_CARDS_KIND,
  fields: {
    cards: {
      type: "array",
      itemKinds: [FLASHCARD_CARD_REF_KIND],
      required: true,
      description: "Every card in the deck, in deck order.",
    },
  },
};

export interface FlashcardCardRef {
  id: string;
  front: string;
  back: string;
}

/** The value a deck-wide AI step is offered — markers included (KINDS_EVERYWHERE §4.2). */
export function toFlashcardDeckCards(cards: readonly FlashcardCardRef[]) {
  return {
    __kind: FLASHCARD_DECK_CARDS_KIND,
    cards: cards.map((c) => ({
      __kind: FLASHCARD_CARD_REF_KIND,
      id: c.id,
      front: c.front,
      back: c.back,
    })),
  };
}

export const FLASHCARD_DECK_CARDS_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: FLASHCARD_DECK_CARDS_KIND,
    schemaSource: "system",
    tier: "eager",
    schema: flashcardDeckCardsKindSchema,
  },
  {
    kind: FLASHCARD_CARD_REF_KIND,
    schemaSource: "system",
    tier: "eager",
    schema: flashcardCardRefKindSchema,
  },
];
