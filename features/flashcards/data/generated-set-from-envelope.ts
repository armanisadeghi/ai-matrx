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
// title is read from the kind's `title` key only, and "" means the payload
// carried none — so the deck's name is never taken from the set alone:
// `generatedDeckName` below is the one place it is decided.

import type { CanonicalBlockIR } from "@ai-matrx/content-ir";
import {
  reconstructRegionValue,
} from "@/features/content-ir/redux/render-block-envelope";
import type { GeneratedCardSet } from "./useGenerateCards";
import { coerceCards, setTitleOf } from "./coerce-card";

/**
 * The name a generated deck is saved under: what the person typed, else the
 * title the agent gave the set, else the topic they asked about, else the
 * house last resort (the same "Study deck" `defaultDeckName` ends on).
 * Total by construction — a deck is never saved with a blank name, whatever
 * the payload carried.
 *
 * A set's `title` CAN be "": since `@ai-matrx/content-ir` 0.19.21 (A MISSING
 * FIELD NEVER DEGRADES A BLOCK) a `flashcard_set` with no `title` — e.g. an
 * old-shape payload carrying only the retired `set_title` — resolves with the
 * field filled blank instead of degrading to a raw root, so
 * `generatedSetFromEnvelope` returns its cards with `title: ""`.
 */
export function generatedDeckName(parts: {
  typedName?: string | null;
  generatedTitle?: string | null;
  topic?: string | null;
}): string {
  return (
    parts.typedName?.trim() ||
    parts.generatedTitle?.trim() ||
    parts.topic?.trim() ||
    "Study deck"
  );
}

/**
 * Map a complete flashcard_set envelope to the persistable set shape.
 * Returns null unless the envelope's root is a `flashcard_set` that finished
 * parsing cleanly AND passed its schema — callers fall back to the legacy
 * extraction result in that case. The returned `title` is "" when the payload
 * carried none; name the deck through `generatedDeckName`, never from it alone.
 */
export function generatedSetFromEnvelope(
  envelope: CanonicalBlockIR,
): Omit<GeneratedCardSet, "conversationId"> | null {
  if (envelope.root.kind !== "flashcard_set") return null;
  if (envelope.root.status !== "complete") return null;
  // 🚨 `kind` + `status` are NOT a validity check. content-ir PRESERVES the
  // kind on a schema failure (a broken flashcard_set stays a flashcard_set so
  // callers can say what broke), and `status` reports only that parsing
  // finished. `kindState` is the validity signal: `"raw"` means the payload
  // was checked against its schema and LOST — a PRESENT value of the wrong
  // type (`cards` that is not a list). A merely ABSENT required field is not
  // that: content-ir 0.19.21 resolves the block and fills the field blank, so
  // a set with no `title` arrives here resolved, with `title: ""`.
  //
  // Deliberately `=== "raw"` and NOT `!== "resolved"`: `"unverified"` means no
  // schema was ever registered for the kind, so nothing was checked and the
  // payload is as trustworthy as it ever was. Treating unverified as failure
  // is THE OUTAGE PIN (2026-08-29) that cost ~221 live kinds their component.
  if (envelope.root.kindState === "raw") return null;

  // Zero-loss read (residue extras merged back), markers included — nothing
  // strips `__kind` any more (KINDS_EVERYWHERE_PLAN §4.2). Nothing leaks
  // either: `setTitleOf` and THE ONE card reader (coerce-card.ts) name every
  // field they take, so the discriminator simply is not one of them.
  const reconstructed = reconstructRegionValue(envelope);
  const title = setTitleOf(reconstructed);
  const cards = coerceCards(reconstructed);

  return { title, cards };
}
