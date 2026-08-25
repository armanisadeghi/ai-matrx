// features/flashcards/data/cardDetailLayers.ts
//
// THE READER for a card's enrichment. `education.enrich_card` has been writing
// `fc_detail` rows (helper / example / detailed / hint / mnemonic / simplified)
// since the depth-on-demand lane shipped, and until now NO surface rendered a
// single one of them: StudyDeck read `details` only to find the `spoken_front`
// audio file, and set detail read them only to compute a boolean badge. The
// learner paid for text they could never see again.
//
// This module is the ONE place that decides which stored detail rows are
// learner-readable TEXT LAYERS, in what order, under what label — so the study
// surface, the set-detail badges, and the bulk-enrich planner all agree on what
// "this card is already enriched" means. Pure: no React, no I/O, testable.
//
// Deliberately NOT layers here:
//   • `spoken_front` / any `audio_file_id` row — audio, played by CardAudioHelp.
//   • `front_image` / `back_image` — faces, owned by `components/study/cardImages.ts`.
//   • rows the memory-aid lane wrote (`metadata.source === "memory_hint"`) —
//     `MemoryAidButton` already renders those through `MemoryHintBlock`, and
//     showing the same aid twice on one card is a defect, not thoroughness.

import type { FcDetailRow } from "./types";

/** The learner-readable text layer kinds, in the order they should be read. */
export const DETAIL_LAYER_ORDER = [
  "simplified",
  "helper",
  "hint",
  "example",
  "detailed",
  "mnemonic",
] as const;

export type DetailLayerKind = (typeof DETAIL_LAYER_ORDER)[number];

const LAYER_RANK = new Map<string, number>(
  DETAIL_LAYER_ORDER.map((kind, i) => [kind, i]),
);

/** What the learner sees above each layer. Plain words, never our kind slugs. */
export const DETAIL_LAYER_LABEL: Record<DetailLayerKind, string> = {
  simplified: "In simpler words",
  helper: "Explain it to me",
  hint: "Hint",
  example: "Example",
  detailed: "Go deeper",
  mnemonic: "Memory trick",
};

/** One renderable layer. */
export interface CardDetailLayer {
  id: string;
  kind: DetailLayerKind;
  label: string;
  text: string;
}

/** Minimal row shape — so callers can pass anything detail-row-like. */
export type DetailLike = Pick<FcDetailRow, "kind" | "text"> &
  Partial<Pick<FcDetailRow, "id" | "position" | "deleted_at" | "metadata">>;

function isMemoryHintRow(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return false;
  }
  return (metadata as Record<string, unknown>).source === "memory_hint";
}

export function isDetailLayerKind(kind: string): kind is DetailLayerKind {
  return LAYER_RANK.has(kind);
}

/**
 * The card's readable enrichment, grouped by kind (kind order first, then the
 * row's own `position`, then insertion order — stable for identical inputs).
 */
export function selectCardDetailLayers(
  details: readonly DetailLike[] | null | undefined,
): CardDetailLayer[] {
  const rows = details ?? [];
  const kept: { layer: CardDetailLayer; rank: number; position: number; i: number }[] =
    [];
  rows.forEach((row, i) => {
    if (!row || typeof row.kind !== "string") return;
    if (!isDetailLayerKind(row.kind)) return;
    if (row.deleted_at) return;
    if (isMemoryHintRow(row.metadata)) return;
    const text = typeof row.text === "string" ? row.text.trim() : "";
    if (!text) return;
    kept.push({
      layer: {
        id: row.id ?? `${row.kind}-${i}`,
        kind: row.kind,
        label: DETAIL_LAYER_LABEL[row.kind],
        text,
      },
      rank: LAYER_RANK.get(row.kind) ?? DETAIL_LAYER_ORDER.length,
      position: typeof row.position === "number" ? row.position : 0,
      i,
    });
  });
  kept.sort(
    (a, b) => a.rank - b.rank || a.position - b.position || a.i - b.i,
  );
  return kept.map((k) => k.layer);
}

/** True when this card already carries readable enrichment. */
export function cardHasDetailLayers(
  details: readonly DetailLike[] | null | undefined,
): boolean {
  return selectCardDetailLayers(details).length > 0;
}
