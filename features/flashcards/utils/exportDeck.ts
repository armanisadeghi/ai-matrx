// features/flashcards/utils/exportDeck.ts
//
// VISION §15 (WP3 gap 6) — "own your data": per-deck and whole-library export
// in every promised format. CSV stays in `importExportCsv.ts` (paired with its
// importer, which WP5 actively extends); the other formats live here so the
// two packages never collide on one file.
//
// Formats:
//  - anki: tab-separated text with modern Anki file headers (`#separator:tab`,
//    `#html:false`) — imports directly via Anki's File → Import. A binary
//    .apkg (SQLite+zip) is deliberately not built in the browser.
//  - markdown: a readable study document (front/back per card, topic noted).
//  - json: lossless — set metadata + every card's fields, the format the
//    library (account-level) export uses for round-tripping.

import type { CardWithDetails, FcSetRow } from "../data/types";

export type DeckExportFormat = "csv" | "anki" | "markdown" | "json";

export interface DeckExportCard {
  front: string;
  back: string;
  topic: string | null;
  card_kind: string | null;
  difficulty: string | null;
}

function toExportCard(c: CardWithDetails): DeckExportCard {
  return {
    front: c.front,
    back: c.back,
    topic: c.topic ?? null,
    card_kind: c.card_kind ?? null,
    difficulty: c.difficulty ?? null,
  };
}

/** Anki text import cannot hold literal tabs/newlines in a field — soften them. */
function ankiField(value: string): string {
  return value.replace(/\t/g, "    ").replace(/\r?\n/g, "<br>");
}

/** Tab-separated, modern-Anki headed. `#html:true` because faces may hold markup. */
export function buildDeckAnkiText(
  cards: Pick<CardWithDetails, "front" | "back">[],
): string {
  const lines = ["#separator:tab", "#html:true", "#columns:Front\tBack"];
  for (const c of cards) {
    lines.push(`${ankiField(c.front)}\t${ankiField(c.back)}`);
  }
  return lines.join("\n");
}

/** A readable markdown study document. */
export function buildDeckMarkdown(
  set: Pick<FcSetRow, "name" | "description">,
  cards: CardWithDetails[],
): string {
  const parts: string[] = [`# ${set.name}`.trim()];
  if (set.description?.trim()) parts.push(set.description.trim());
  cards.forEach((c, i) => {
    const topic = c.topic?.trim() ? ` · ${c.topic.trim()}` : "";
    parts.push(
      `## Card ${i + 1}${topic}\n\n**Q:** ${c.front}\n\n**A:** ${c.back}`,
    );
  });
  return parts.join("\n\n") + "\n";
}

/** Lossless per-deck JSON. */
export function buildDeckJson(
  set: FcSetRow,
  cards: CardWithDetails[],
): string {
  return JSON.stringify(
    {
      format: "matrx-flashcards",
      version: 1,
      set: {
        id: set.id,
        name: set.name,
        description: set.description ?? null,
      },
      cards: cards.map(toExportCard),
    },
    null,
    2,
  );
}

/** Whole-library JSON — every deck the learner owns, one file. */
export function buildLibraryJson(
  decks: { set: FcSetRow; cards: CardWithDetails[] }[],
): string {
  return JSON.stringify(
    {
      format: "matrx-flashcards-library",
      version: 1,
      exported_at: new Date().toISOString(),
      sets: decks.map(({ set, cards }) => ({
        id: set.id,
        name: set.name,
        description: set.description ?? null,
        cards: cards.map(toExportCard),
      })),
    },
    null,
    2,
  );
}

export function safeFilename(name: string, fallback: string): string {
  return (
    name.trim().replace(/[^\w\- ]+/g, "").replace(/\s+/g, "_") || fallback
  );
}

/** Trigger a browser download. Client-only. */
export function downloadTextFile(
  filename: string,
  mime: string,
  content: string,
): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
