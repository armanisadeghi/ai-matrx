/**
 * The pure half of the board's education items (`education-items.tsx`): keys, saved source shapes
 * and how to read them back. No React, no Supabase.
 *
 * A Flashcard deck is `{ kind: "entity", entity: "fc_set", id }` (`education.fc_set`).
 * A Study kit is `{ kind: "entity", entity: "study-kit", id: <source material id>,
 * meta: { from: <source entity token> } }`: the kit's id IS its source material's id
 * (`features/education/kits/FEATURE.md`), and a source that is not a file says what it is in `meta.from`.
 */

import type { NodeSource } from "../board/document";

export const FLASHCARD_ITEM_KEY = "fc_set";
export const KIT_ITEM_KEY = "study-kit";

export function deckSource(id: string | null): NodeSource {
  return { kind: "entity", entity: FLASHCARD_ITEM_KEY, id };
}

export function deckIdOf(source: NodeSource): string | null {
  return source.kind === "entity" && source.entity === FLASHCARD_ITEM_KEY ? source.id : null;
}

export function kitSource(sourceType: string | null, sourceId: string | null): NodeSource {
  return {
    kind: "entity",
    entity: KIT_ITEM_KEY,
    id: sourceId,
    ...(sourceId && sourceType && sourceType !== "file" ? { meta: { from: sourceType } } : {}),
  };
}

/** The kit a saved tile names, or null for a tile whose kit is not made yet. */
export function kitFromSource(source: NodeSource): { sourceType: string; sourceId: string } | null {
  if (source.kind !== "entity" || source.entity !== KIT_ITEM_KEY || !source.id) return null;
  return { sourceType: source.meta?.from ?? "file", sourceId: source.id };
}
