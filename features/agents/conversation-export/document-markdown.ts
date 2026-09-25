// document-markdown — the text a conversation hands to the ONE document
// exporter (`@ai-matrx/print/document`).
//
// Only storage plumbing is removed here: kind envelopes
// (`<artifact …>| table |</artifact>`) are unwrapped to their body with the
// shared `unwrapKindEnvelopes` projection, so the package parses a REAL table.
//
// Math is NOT touched here. The package lifts it with the core's one math
// dialect (`@ai-matrx/content-ir/source`) and typesets it in every format —
// drawn in PDF, native equations in Word, MathML in HTML/EPUB. The app-side
// math pre-pass that used to live here paired a stray `$$` in the user's
// prose with the formula's opener and corrupted the answer (verify-RC-B10 F2);
// never add one back.

import { unwrapKindEnvelopes } from "@/lib/markdown/plain-text";

export function documentMarkdown(markdown: string): string {
  return unwrapKindEnvelopes(markdown);
}
