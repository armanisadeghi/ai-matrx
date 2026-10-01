// features/flashcards/components/create/cardProgressLine.ts
//
// THE one progress line for a card run that fans out over sections (Create
// deck and "Add more cards"). Plain words, one line (copy law R9, V4-F
// 2026-09-30): "Making 5 cards — 3 ready · 2/4 parts". Never a section index, never a
// section label ("Last done: Part (7/10)" was machinery), and never a count
// past what the person asked for (THE COUNT LAW — `progressItemCount`).
//
// THE NO-FREEZE RULE (2026-09-30, `convert/segmentedGenerate.ts`): the line is
// shown from the first tick ("— 0 ready"), and a part being tried again or a
// part that could not be made is shown as state the moment it happens, so a
// slow run never looks frozen and a failure is never held to the end.

import type { ConvertProgress } from "@/features/education/convert/types";

/** "1 card", "5 cards", "1 new card" — every card count on Create deck and Add more cards. */
export function cardCount(n: number, adjective = ""): string {
  return `${n} ${adjective ? `${adjective} ` : ""}${n === 1 ? "card" : "cards"}`;
}

/**
 * Add more cards' run button. `shown` is the number the count field shows (null while it is
 * empty or out of range), so the label never names a number the field does not (verify-7 #3).
 */
export function makeMoreCardsLabel(shown: number | null): string {
  return shown === null ? "Make more cards" : `Make ${shown} more ${shown === 1 ? "card" : "cards"}`;
}

export function cardProgressLine(
  progress: ConvertProgress | null,
  requested: number,
  adjective = "",
): string | null {
  if (!progress || progress.total <= 1) return null;
  const ready = Math.min(progress.items, requested);
  const line = `Making ${cardCount(requested, adjective)} — ${ready} ready`;
  const retrying = progress.retrying ?? 0;
  const failed = progress.failed ?? 0;
  if (retrying > 0) return `${line} · retrying ${retrying} ${retrying === 1 ? "part" : "parts"}`;
  if (failed > 0) return `${line} · ${failed} ${failed === 1 ? "part" : "parts"} missed`;
  // Parts finished, so the line moves while cards are still being written —
  // a run whose cards all land at the end otherwise sat on "0 ready" (verify-6
  // #8, 2026-10-01). A count, never a section index or label.
  return `${line} · ${Math.min(progress.done, progress.total)}/${progress.total} parts`;
}
