// features/education/onboard/import/importDeck.ts
//
// Direct deck import (P9 front door — the NON-AI path): a user's existing deck
// from Quizlet / CSV / TSV / plain paste / Matrx-JSON lands as a NATIVE deck,
// verbatim, no generation. Reuses the flashcards parser (`parseImportText`) for
// delimited text and the portable-JSON round-trip parser; persists via the ONE
// deck writer, `fcService.createSetWithCards`. Anki `.apkg` has its own module
// (`importAnki.ts`) because it needs zip+SQLite decoding.

import { fcService } from "@/features/flashcards/data/fcService";
import type { NewCardInput } from "@/features/flashcards/data/types";
import {
  parseImportText,
  type FieldDelimiter,
} from "@/features/flashcards/utils/importExportCsv";
import { parseDeckJson } from "../export/deckFormats";

export interface ImportOutcome {
  setId: string;
  name: string;
  cardCount: number;
  /** What was preserved / skipped, for the "what we imported" summary. */
  skipped: number;
  format: DirectImportFormat;
  /** Optional honest note about what was / wasn't preserved (e.g. Anki media). */
  note?: string;
}

export type DirectImportFormat = "json" | "delimited" | "anki";

/** Persist parsed cards as a native deck. Shared by every direct-import path. */
export async function persistImportedDeck(
  name: string,
  cards: NewCardInput[],
  format: DirectImportFormat,
  skipped: number,
  note?: string,
): Promise<ImportOutcome> {
  if (cards.length === 0) {
    throw new Error("No cards found to import.");
  }
  const res = await fcService.createSetWithCards({ name }, cards);
  if (res.error || !res.data) {
    throw new Error(
      typeof res.error === "string" ? res.error : "Failed to save the imported deck",
    );
  }
  return {
    setId: res.data.set.id,
    name: res.data.set.name,
    cardCount: cards.length,
    skipped,
    format,
    note,
  };
}

/** Import a Matrx portable-JSON export (round-trips deckFormats.buildDeckExport). */
export async function importPortableJson(raw: string): Promise<ImportOutcome> {
  const parsed = parseDeckJson(raw);
  if (!parsed) throw new Error("That doesn't look like a Matrx deck export.");
  const cards: NewCardInput[] = parsed.cards.map((c) => ({
    front: c.front,
    back: c.back,
    card_kind: c.card_kind ?? undefined,
    difficulty: c.difficulty ?? undefined,
    topic: c.topic ?? undefined,
    // Preserve the P0 TrustEnvelope on round-trip when present.
    ...(c.trust ? { metadata: { trust: c.trust } } : {}),
  }));
  return persistImportedDeck(parsed.name, cards, "json", 0);
}

/** Import delimited text (Quizlet export, CSV, TSV, or pasted term/def pairs). */
export async function importDelimited(
  text: string,
  name: string,
  delimiter: FieldDelimiter = "tab",
): Promise<ImportOutcome> {
  const { rows, skipped } = parseImportText(text, delimiter);
  const cards: NewCardInput[] = rows.map((r) => ({ front: r.front, back: r.back }));
  return persistImportedDeck(name || "Imported deck", cards, "delimited", skipped.length);
}

/**
 * Import a File whose type we sniff: `.json` → portable JSON; everything else
 * text-like → delimited. (`.apkg` is routed to importAnki upstream.)
 */
export async function importDeckFile(file: File): Promise<ImportOutcome> {
  const text = await file.text();
  const baseName = file.name.replace(/\.[^.]+$/, "");
  if (/\.json$/i.test(file.name) || text.trimStart().startsWith("{")) {
    try {
      return await importPortableJson(text);
    } catch {
      // fall through to delimited if it wasn't our JSON shape
    }
  }
  const delimiter: FieldDelimiter = /\t/.test(text)
    ? "tab"
    : text.includes(",")
      ? "comma"
      : "tab";
  return importDelimited(text, baseName, delimiter);
}
