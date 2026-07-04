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
// so a transition-shape payload (`set_title`, undeclared card fields) still
// persists correctly whichever schema — compiled bootstrap or flexible_data —
// was live during the parse.

import type { CanonicalBlockIR } from "@/features/content-ir/core/ir-types";
import {
  reconstructRegionValue,
  stripKindDeep,
} from "@/features/content-ir/redux/render-block-envelope";
import type { GeneratedCardSet } from "./useGenerateCards";
import type { NewCardInput } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Map a complete flashcard_set envelope to the persistable set shape.
 * Returns null unless the envelope's root is a `flashcard_set` that finished
 * parsing cleanly (`status: "complete"`) — callers fall back to the legacy
 * extraction result in that case.
 */
export function generatedSetFromEnvelope(
  envelope: CanonicalBlockIR,
): GeneratedCardSet | null {
  if (envelope.root.kind !== "flashcard_set") return null;
  if (envelope.root.status !== "complete") return null;

  // Zero-loss read (residue extras merged back), then the parser-injected
  // __kind discriminators are stripped so nothing internal leaks onward.
  const reconstructed = stripKindDeep(reconstructRegionValue(envelope));
  if (!isRecord(reconstructed)) return null;

  const set_title =
    optionalString(reconstructed.title) ??
    // Transition alias: the OLD agent payload key.
    optionalString(reconstructed.set_title) ??
    "";

  const rawCards = Array.isArray(reconstructed.cards)
    ? reconstructed.cards
    : [];
  const cards: NewCardInput[] = [];
  for (const raw of rawCards) {
    if (!isRecord(raw)) continue;
    const front = typeof raw.front === "string" ? raw.front.trim() : "";
    const back = typeof raw.back === "string" ? raw.back.trim() : "";
    if (!front && !back) continue; // unusable entry — skip, never throw

    cards.push({
      front,
      back,
      card_kind: optionalString(raw.card_kind) ?? "basic",
      difficulty: optionalString(raw.difficulty),
      topic: optionalString(raw.topic),
    });
  }

  return { set_title, cards };
}
