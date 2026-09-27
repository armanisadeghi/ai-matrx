"use client";

// features/rich-document/annotations/PassageQuote.tsx
//
// A quoted passage as the reader SAW it. An anchor's `exact` is a slice of the
// SOURCE markdown, so it can carry markers (`Every map is **selective**`) — and,
// cut mid-markup, half of a pair (`Large-scale map:** Covers a **small are`).
// The quote renders through THE one inline renderer (<RichContent level="inline">)
// after dropping the half-pair a slice cut off, so bold reads as bold and no
// stray asterisks show.

import { RichContent } from "@/components/rich-content/RichContent";

const PAIRED = ["**", "__", "~~", "`"] as const;

/** Drop the marker a slice cut in half (the one nearer the cut edge). Pure; unit-tested. */
export function balancedPassageSource(exact: string): string {
  let s = exact;
  for (const marker of PAIRED) {
    const count = s.split(marker).length - 1;
    if (count % 2 === 0) continue;
    const first = s.indexOf(marker);
    const last = s.lastIndexOf(marker);
    const cutAtStart = first <= s.length - (last + marker.length);
    const at = cutAtStart ? first : last;
    s = s.slice(0, at) + s.slice(at + marker.length);
  }
  // A single `*` / `_` emphasis cut in half: drop a lone marker at either edge.
  s = s.replace(/^[*_](?=\S)/, "").replace(/(?<=\S)[*_]$/, "");
  return s.trim();
}

export function PassageQuote({ exact }: { exact: string }) {
  return <RichContent level="inline" source={balancedPassageSource(exact)} />;
}
