// features/flashcards/data/cardEnrichmentEnvelope.ts
//
// THE STREAMING READER for one card's enrichment — a live `card_enrichment`
// content-ir envelope → the value the registered `card_enrichment` component
// renders.
//
// This is the mid-stream twin of `cardDetailLayers.ts` (which reads STORED
// `fc_detail` rows). It exists because the bulk-enrich cascade shows a card's
// layers materializing one at a time, and mid-stream a detail is a legitimately
// partial object: `text` half-written, `kind` not yet arrived.
//
// It opens NO parse session. The envelope handed in is the one the
// StreamBlockAccumulator already produced for the run
// (`selectKindEnvelope(requestId, "card_enrichment")`) — the same session whose
// extracted JSON the runner persists. One parser, display AND persistence.
//
// Rules it enforces, both borrowed from the flashcard_set bridge:
//   • A detail with no text yet is not a detail — an empty labelled box is
//     noise, and the next flush brings its first characters.
//   • A detail whose `kind` hasn't arrived keeps `kind` ABSENT rather than
//     being guessed into a bucket: the component renders a neutral chip and
//     colours in when the real kind lands. Guessing would show the wrong label
//     to a learner for a few hundred milliseconds.

import type { CanonicalBlockIR } from "@ai-matrx/content-ir";

/** A layer as it looks mid-stream: text always, kind once it has arrived. */
export interface StreamingEnrichmentDetail {
  kind?: string;
  text: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The layers readable RIGHT NOW from a live `card_enrichment` envelope.
 * Returns `[]` for a null envelope, a non-matching kind, or a payload with
 * nothing renderable yet — the caller's cue to keep its "writing…" line up.
 */
export function streamingEnrichmentDetails(
  envelope: CanonicalBlockIR | null | undefined,
): StreamingEnrichmentDetail[] {
  if (!envelope || envelope.root.kind !== "card_enrichment") return [];
  const raw = envelope.root.value?.details;
  if (!Array.isArray(raw)) return [];
  const out: StreamingEnrichmentDetail[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const text = typeof entry.text === "string" ? entry.text.trim() : "";
    if (!text) continue;
    const kind = typeof entry.kind === "string" ? entry.kind.trim() : "";
    out.push(kind ? { kind, text } : { text });
  }
  return out;
}

/**
 * Wrap layers (streamed or stored) as a `card_enrichment` kind instance — the
 * exact value shape `KindInstanceRender kind="card_enrichment"` consumes, so a
 * live card and a finished card render through the SAME component.
 */
export function cardEnrichmentValue(
  details: readonly StreamingEnrichmentDetail[],
): Record<string, unknown> {
  return {
    __kind: "card_enrichment",
    details: details.map((d) => ({
      __kind: "card_detail",
      ...(d.kind ? { kind: d.kind } : {}),
      text: d.text,
    })),
  };
}
