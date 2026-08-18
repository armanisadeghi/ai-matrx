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
  EXPORT_EXT,
  EXPORT_LABEL,
  EXPORT_MIME,
  type DeckExportFormat,
} from "@/features/education/onboard/export/deckFormats";

export type { DeckExportFormat };

/**
 * Filename + mime + label for one deck export — re-exposed FROM the canonical
 * maps in `deckFormats.ts` so both export surfaces name files identically.
 * (An earlier hardcoded copy here had already drifted from them — adversarial
 * finding F4. Never define these values twice.)
 */
export const DECK_EXPORT_FILE: Record<
  DeckExportFormat,
  { ext: string; mime: string; label: string }
> = {
  csv: { ext: EXPORT_EXT.csv, mime: EXPORT_MIME.csv, label: EXPORT_LABEL.csv },
  anki: {
    ext: EXPORT_EXT.anki,
    mime: EXPORT_MIME.anki,
    label: EXPORT_LABEL.anki,
  },
  md: { ext: EXPORT_EXT.md, mime: EXPORT_MIME.md, label: EXPORT_LABEL.md },
  json: {
    ext: EXPORT_EXT.json,
    mime: EXPORT_MIME.json,
    label: EXPORT_LABEL.json,
  },
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
  // Canonical EXPORT_MIME values already carry the charset — never append a
  // second one.
  const blob = new Blob([content], {
    type: mime.includes("charset") ? mime : `${mime};charset=utf-8;`,
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
