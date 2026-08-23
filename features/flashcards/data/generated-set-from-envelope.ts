// features/flashcards/data/generated-set-from-envelope.ts
//
// The typed save path: ONE content-ir parse drives BOTH the live preview and
// persistence. CreateFromTopic feeds the agent stream into a ParseSession
// (useLiveJsonRegion); when the region completes, this maps the canonical
// envelope straight into the GeneratedCardSet the persistence layer already
// consumes — no second parse of the same payload.
//
// Zero data loss: `reconstructRegionValue` merges every node's residue extras
// (keys the active schema didn't declare) back into the value before mapping,
// so undeclared card fields still persist correctly whichever schema —
// compiled bootstrap or flexible_data — was live during the parse. The set
// title is read from the kind's `title` key only.

import type { CanonicalBlockIR } from "@ai-matrx/content-ir";
import {
  reconstructRegionValue,
  stripKindDeep,
} from "@/features/content-ir/redux/render-block-envelope";
import type { GeneratedCardSet } from "./useGenerateCards";
import { coerceCards, setTitleOf } from "./coerce-card";

/**
 * Map a complete flashcard_set envelope to the persistable set shape.
 * Returns null unless the envelope's root is a `flashcard_set` that finished
 * parsing cleanly (`status: "complete"`) — callers fall back to the legacy
 * extraction result in that case.
 */
export function generatedSetFromEnvelope(
  envelope: CanonicalBlockIR,
): Omit<GeneratedCardSet, "conversationId"> | null {
  if (envelope.root.kind !== "flashcard_set") return null;
  if (envelope.root.status !== "complete") return null;

  // Zero-loss read (residue extras merged back), then the parser-injected
  // __kind discriminators are stripped so nothing internal leaks onward.
  // The cards narrow through THE ONE card reader (coerce-card.ts).
  const reconstructed = stripKindDeep(reconstructRegionValue(envelope));
  const title = setTitleOf(reconstructed);
  const cards = coerceCards(reconstructed);

  return { title, cards };
}
