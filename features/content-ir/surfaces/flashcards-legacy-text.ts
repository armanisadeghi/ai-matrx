/**
 * `flashcards_legacy_text` — the named parser strategy behind the
 * `<flashcards>` XML surface (kind_surface: xml_tag/flashcards →
 * flashcard_set).
 *
 * WRAPS the one existing legacy text parser — `parseFlashcards`, the exact
 * code FlashcardsBlock renders "---"-separated "Front:/Back:" text through
 * today. It NEVER re-implements that grammar; it only maps the parser's
 * complete cards onto the canonical flashcard_set value, so the XML surface
 * converges to the SAME shape a `__kind` JSON arrival carries (THE
 * KEYSTONE). Bare-minimum mapping: front/back only (back keeps multi-line
 * bullet text verbatim as one string).
 *
 * Title: the flashcard_set schema REQUIRES `title` (verified against the
 * live content_ir.kind_definition row — the kind parser drops a title-less
 * set to raw), but the legacy text format carries none. The strategy emits
 * the family's established default "Flashcards" — the same fallback
 * flashcardsMarkdownFromValue and the component's own set label use — so the
 * converged value is schema-valid, not just bridge-tolerated.
 */

import { parseFlashcards } from "@/components/mardown-display/blocks/flashcards/flashcard-parser";
import { KIND_KEY } from "../core/kind-schema.types";

const DEFAULT_SET_TITLE = "Flashcards";

/** Opening tag with optional attributes, e.g. `<flashcards>` — host framing. */
const OPENING_TAG_RE = /^\s*<flashcards(?:\s[^>]*)?>/i;
const CLOSING_TAG = "</flashcards>";

/**
 * Completed `<flashcards>` region text → canonical flashcard_set value, or
 * null when the region yields no complete card (the caller treats null as
 * parse failure: loud, legacy rendering untouched).
 *
 * Accepts BOTH host framings — the accumulator's region text includes the
 * literal tags, the splitter's is inner-only. Framing is stripped, then the
 * closing tag is re-appended as the parser's completion sentinel: this
 * strategy only runs for COMPLETED regions (the hosts gate on the closing
 * tag), and `parseFlashcards` includes the final front/back pair only when
 * it sees `</flashcards>`. Identical values from both hosts → identical
 * envelopes (fingerprint hashes the value).
 */
export function flashcardsLegacyTextToKindValue(
  regionText: string,
): Record<string, unknown> | null {
  let inner = regionText.replace(OPENING_TAG_RE, "");
  const closeIdx = inner.indexOf(CLOSING_TAG);
  if (closeIdx !== -1) inner = inner.slice(0, closeIdx);

  const { flashcards } = parseFlashcards(`${inner}\n${CLOSING_TAG}`);
  if (flashcards.length === 0) return null;

  return {
    [KIND_KEY]: "flashcard_set",
    title: DEFAULT_SET_TITLE,
    cards: flashcards.map((card) => ({
      [KIND_KEY]: "flashcard",
      front: card.front,
      back: card.back,
    })),
  };
}
