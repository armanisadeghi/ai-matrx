// features/education/library/types.ts
//
// The community library (P6 Phase C): browse public decks, the Certified tier,
// and the suggest-edit contribution flywheel.

import type { Database } from "@/types/database.types";

/** One public deck row from `edu_public_decks` (card count + certified status). */
export interface PublicDeck {
  id: string;
  name: string;
  description: string | null;
  topic: string | null;
  difficulty: string | null;
  cardCount: number;
  certified: boolean;
  certifiedNote: string | null;
  updatedAt: string;
}

/** Raw RPC row shape (snake_case) before mapping. */
export type PublicDeckRow =
  Database["public"]["Functions"]["edu_public_decks"]["Returns"][number];

export function mapPublicDeck(row: PublicDeckRow): PublicDeck {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    topic: row.topic,
    difficulty: row.difficulty,
    cardCount: Number(row.card_count ?? 0),
    certified: row.certified ?? false,
    certifiedNote: row.certified_note,
    updatedAt: row.updated_at,
  };
}

/** A suggest-edit row (owner inbox / contributor view). */
export type DeckSuggestionRow =
  Database["education"]["Tables"]["deck_suggestion"]["Row"];
