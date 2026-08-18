// features/flashcards/utils/exportDeck.ts
//
// VISION §15 (WP3 gap 6) — "own your data". The FORMATS are NOT defined here:
// `features/education/onboard/export/deckFormats.ts` is the canonical writer
// (`buildDeckExport` — json/md/anki/csv, `PortableDeck` v2, preserves
// `metadata.trust`) and its importer round-trips exactly that shape. This
// module holds only what a single-deck menu and a whole-library export need on
// top of it: the download mechanics and the library envelope.
//
// A second format implementation lived here for one session and was deleted the
// same day (WP12 caught it): it dropped `metadata.trust` and made two menus
// disagree about what a Matrx JSON export is.

import type { CardWithDetails, FcSetRow } from "../data/types";
import {
  buildDeckExport,
  toPortableDeck,
  type DeckExportFormat,
} from "@/features/education/onboard/export/deckFormats";

export type { DeckExportFormat };

/** Filename + mime for one deck export, so every caller names files alike. */
export const DECK_EXPORT_FILE: Record<
  DeckExportFormat,
  { ext: string; mime: string; label: string }
> = {
  csv: { ext: "csv", mime: "text/csv", label: "CSV" },
  anki: { ext: "anki.txt", mime: "text/plain", label: "Anki (text import)" },
  md: { ext: "md", mime: "text/markdown", label: "Markdown" },
  json: { ext: "json", mime: "application/json", label: "JSON" },
};

/** One deck, one format — delegates every byte to the canonical writer. */
export function buildDeckFile(
  set: FcSetRow,
  cards: CardWithDetails[],
  format: DeckExportFormat,
): string {
  return buildDeckExport(set, cards, format, new Date().toISOString());
}

/** Whole-library JSON — every deck the learner owns, one file. Each entry is a
 * canonical `PortableDeck`, so a single deck can be re-imported from it. */
export function buildLibraryJson(
  decks: { set: FcSetRow; cards: CardWithDetails[] }[],
): string {
  const exportedAt = new Date().toISOString();
  return JSON.stringify(
    {
      format: "matrx-flashcards-library",
      version: 2,
      exported_at: exportedAt,
      sets: decks.map(({ set, cards }) =>
        toPortableDeck(set, cards, exportedAt),
      ),
    },
    null,
    2,
  );
}

export function safeFilename(name: string, fallback: string): string {
  return name.trim().replace(/[^\w\- ]+/g, "").replace(/\s+/g, "_") || fallback;
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
