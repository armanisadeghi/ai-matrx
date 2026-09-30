// features/flashcards/components/create/cardProgressLine.ts
//
// THE one progress line for a card run that fans out over sections (Create
// deck and "Add more cards"). Plain words, one line (copy law R9, V4-F
// 2026-09-30): "Making 5 cards — 3 ready". Never a section index, never a
// section label ("Last done: Part (7/10)" was machinery), and never a count
// past what the person asked for (THE COUNT LAW — `progressItemCount`).

import type { ConvertProgress } from "@/features/education/convert/types";

export function cardProgressLine(
  progress: ConvertProgress | null,
  requested: number,
  cards = "cards",
): string | null {
  if (!progress || progress.total <= 1) return null;
  const ready = Math.min(progress.items, requested);
  return `Making ${requested} ${cards} — ${ready} ready`;
}
