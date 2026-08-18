// features/education/onboard/import/importDeck.ts
//
// Direct deck import (P9 front door — the NON-AI path): a user's existing deck
// from Quizlet / CSV / TSV / plain paste / Matrx-JSON lands as a NATIVE deck,
// verbatim, no generation. Reuses the flashcards parser (`parseImportText`) for
// delimited text and the portable-JSON round-trip parser; persists via the ONE
// deck writer, `fcService.createSetWithCards`. Anki `.apkg` has its own module
// (`importAnki.ts`) because it needs zip+SQLite decoding.
//
// IC-11 (education-platform INTEGRATION_MAP): `persistImportedDeck` is THE one
// import entry. Every import source — file, paste, Anki, extension capture —
// lands through it; nothing calls `createSetWithCards` (or the tables) direct.

import { fcService } from "@/features/flashcards/data/fcService";
import type { NewCardInput } from "@/features/flashcards/data/types";
import {
  parseImportText,
  parseCsvRecords,
  type FieldDelimiter,
  type SkippedLine,
} from "@/features/flashcards/utils/importExportCsv";
import { parseDeckJson } from "../export/deckFormats";

export interface ImportOutcome {
  setId: string;
  name: string;
  cardCount: number;
  /** How many source lines/notes were skipped (never guessed). */
  skipped: number;
  /** Per-line skip detail when the source had addressable lines. */
  skippedLines?: SkippedLine[];
  format: DirectImportFormat;
  /** Optional honest note about what was / wasn't preserved (e.g. Anki media). */
  note?: string;
}

export type DirectImportFormat = "json" | "delimited" | "anki";

export interface ImportedDeckInput {
  name: string;
  description?: string | null;
  topic?: string | null;
  difficulty?: string | null;
  cards: NewCardInput[];
  format: DirectImportFormat;
  skipped?: number;
  skippedLines?: SkippedLine[];
  note?: string;
}

/** Persist parsed cards as a native deck. THE shared entry for every direct-import path (IC-11). */
export async function persistImportedDeck(input: ImportedDeckInput): Promise<ImportOutcome> {
  const { name, cards, format, note } = input;
  if (cards.length === 0) {
    throw new Error("No cards found to import.");
  }
  const res = await fcService.createSetWithCards(
    {
      name,
      description: input.description ?? null,
      topic: input.topic ?? null,
      difficulty: input.difficulty ?? null,
    },
    cards,
  );
  if (res.error || !res.data) {
    throw new Error(
      typeof res.error === "string" ? res.error : "Failed to save the imported deck",
    );
  }
  return {
    setId: res.data.set.id,
    name: res.data.set.name,
    cardCount: cards.length,
    skipped: input.skipped ?? input.skippedLines?.length ?? 0,
    skippedLines: input.skippedLines,
    format,
    note,
  };
}

/** Import a Matrx portable-JSON export (round-trips deckFormats.buildDeckExport,
 * deck-level fields included). */
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
  return persistImportedDeck({
    name: parsed.name,
    description: parsed.description,
    topic: parsed.topic,
    difficulty: parsed.difficulty,
    cards,
    format: "json",
  });
}

/** Import delimited text (Quizlet export, CSV, TSV, or pasted term/def pairs). */
export async function importDelimited(
  text: string,
  name: string,
  delimiter: FieldDelimiter = "tab",
): Promise<ImportOutcome> {
  const { rows, skipped } = parseImportText(text, delimiter);
  const cards: NewCardInput[] = rows.map((r) => ({ front: r.front, back: r.back }));
  return persistImportedDeck({
    name: name || "Imported deck",
    cards,
    format: "delimited",
    skippedLines: skipped,
  });
}

/** Import a real RFC-4180 CSV file (quoted fields, embedded commas/newlines,
 * `front,back` header row) — the shape our own CSV export writes. */
export async function importCsvFile(text: string, name: string): Promise<ImportOutcome> {
  const { rows, skipped } = parseCsvRecords(text);
  const cards: NewCardInput[] = rows.map((r) => ({ front: r.front, back: r.back }));
  return persistImportedDeck({
    name: name || "Imported deck",
    cards,
    format: "delimited",
    skippedLines: skipped,
  });
}

/**
 * Import a File whose type we sniff: `.json` → portable JSON; `.csv` (or text
 * with quoted fields) → RFC-4180 CSV; everything else text-like → delimited.
 * (`.apkg` is routed to importAnki upstream.)
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
  if (/\.csv$/i.test(file.name) || /(^|\r?\n)"/.test(text)) {
    return importCsvFile(text, baseName);
  }
  const delimiter: FieldDelimiter = /\t/.test(text)
    ? "tab"
    : text.includes(",")
      ? "comma"
      : "tab";
  return importDelimited(text, baseName, delimiter);
}
