// features/flashcards/data/undoCardBatch.ts
//
// "Undo last add": archive exactly the cards one generation run added to a deck
// (those carrying `metadata.batch_id`), through the deck's own card-removal path
// (`fcService.deleteCard` — a soft delete, never a hard one). Cards another run or
// the person added are never touched.

import { BATCH_KEY } from "@/features/education/kits/outline/types";
import { fcService } from "./fcService";

/** The cards of `cards` that belong to `batchId`. */
export function cardsInBatch<C extends { metadata?: unknown }>(
  cards: readonly C[],
  batchId: string,
): C[] {
  if (!batchId) return [];
  return cards.filter((c) => {
    const meta = c.metadata;
    return (
      !!meta &&
      typeof meta === "object" &&
      !Array.isArray(meta) &&
      (meta as Record<string, unknown>)[BATCH_KEY] === batchId
    );
  });
}

/** Archive the batch's cards. Returns how many were removed, or the honest error. */
export async function undoCardBatch(
  setId: string,
  batchId: string,
): Promise<{ removed: number; error: string | null }> {
  const current = await fcService.getSetWithCards(setId);
  if (!current.data) return { removed: 0, error: current.error ?? "The deck could not be read." };
  const mine = cardsInBatch(current.data.cards, batchId);
  let removed = 0;
  for (const card of mine) {
    const res = await fcService.deleteCard(card.id, card.version);
    if (res.error) {
      return { removed, error: `${res.error} (${removed} of ${mine.length} removed)` };
    }
    removed++;
  }
  return { removed, error: null };
}
