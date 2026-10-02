// features/flashcards/data/publicDeck.ts
//
// The PUBLIC deck shape — what `public.get_public_flashcard_set` hands an
// anonymous visitor (set + ordered cards, face images as durable URLs) — and
// the ONE adapter that turns it into the `CardWithDetails` rows the shared
// <StudyDeck/> renders. Both public lanes use it: the indexable `/p/e/fc_set/…`
// viewer and the `/s/[token]` share-link lens.
//
// The adapter fills the row's account-only columns (organization, owner,
// version…) with inert values: the public deck is studied on the device, so
// nothing here is ever written back. A card kind whose payload the public read
// does not carry (`dynamic_content` — matching pairs, formula parts) is studied
// as a plain flip card rather than rendering an empty mini-game.

import type { CardWithDetails, FcDetailRow } from "./types";
import { asCardKind, CARD_KIND } from "../utils/cardVariants";

export interface PublicFlashcard {
  id: string;
  front: string;
  back: string;
  card_kind?: string | null;
  difficulty?: string | null;
  topic?: string | null;
  lesson?: string | null;
  position?: number | null;
  /** Durable face-image URLs (hotlinked/CDN) — a bare file_id is unusable anon. */
  front_image_url?: string | null;
  front_image_alt?: string | null;
  back_image_url?: string | null;
  back_image_alt?: string | null;
}

/** `get_public_flashcard_set` → `{ success, set, cards }`. */
export interface PublicFlashcardSetPayload {
  success?: boolean;
  set?: Record<string, unknown>;
  cards?: PublicFlashcard[];
}

const EPOCH = "1970-01-01T00:00:00.000Z";

function imageDetail(
  card: PublicFlashcard,
  face: "front" | "back",
): FcDetailRow | null {
  const url = face === "front" ? card.front_image_url : card.back_image_url;
  if (!url) return null;
  const alt = face === "front" ? card.front_image_alt : card.back_image_alt;
  return {
    id: `${card.id}:${face}_image`,
    card_id: card.id,
    kind: `${face}_image`,
    image_url: url,
    image_file_id: null,
    audio_file_id: null,
    text: alt ?? "",
    metadata: {},
    custom_fields: {},
    position: 0,
    generated_by: "public",
    generation_status: "complete",
    organization_id: "",
    created_by: null,
    updated_by: null,
    created_at: EPOCH,
    updated_at: EPOCH,
    deleted_at: null,
    version: 1,
  };
}

/** Kinds whose study rendering needs `dynamic_content`, which is not public. */
const PAYLOAD_KINDS = new Set<string>([CARD_KIND.matching, CARD_KIND.formula]);

export function publicCardsToStudyCards(
  cards: readonly PublicFlashcard[],
): CardWithDetails[] {
  return cards.map((card, index) => {
    const kind = asCardKind(card.card_kind);
    const details = [imageDetail(card, "front"), imageDetail(card, "back")].filter(
      (d): d is FcDetailRow => d !== null,
    );
    return {
      id: card.id,
      front: card.front ?? "",
      back: card.back ?? "",
      card_kind: PAYLOAD_KINDS.has(kind) ? CARD_KIND.basic : (card.card_kind ?? CARD_KIND.basic),
      difficulty: card.difficulty ?? null,
      topic: card.topic ?? null,
      lesson: card.lesson ?? null,
      position: card.position ?? index,
      dynamic_content: {},
      metadata: {},
      custom_fields: {},
      personal_notes: null,
      organization_id: "",
      created_by: null,
      updated_by: null,
      created_at: EPOCH,
      updated_at: EPOCH,
      deleted_at: null,
      published_to_web: true,
      published_to_web_at: null,
      published_to_web_by: null,
      shown_to: null,
      version: 1,
      visibility: "public",
      details,
    };
  });
}
