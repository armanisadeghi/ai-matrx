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
// import entry. Every IMPORT source — file, paste, Anki, extension capture —
// lands through it, never `createSetWithCards` direct. (AI *generation* flows
// like CreateFromTopic/CreateFromSource are not imports; they may call the one
// row writer themselves.)

import { fcService } from "@/features/flashcards/data/fcService";
import type { NewCardInput } from "@/features/flashcards/data/types";
import {
  parseImportText,
  parseCsvRecords,
  type FieldDelimiter,
  type SkippedLine,
} from "@/features/flashcards/utils/importExportCsv";
import {
  parseDeckJson,
  type ParsedPortableDeck,
  type PortableCard,
} from "../export/deckFormats";
import { seedImportedScheduling } from "./seedScheduling";

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
  /** Created card ids in input order — lets a caller seed per-card state
   * (e.g. imported review history) against the rows it just made. */
  cardIds: string[];
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
  const createdCards = [...res.data.cards].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0),
  );
  return {
    setId: res.data.set.id,
    name: res.data.set.name,
    cardIds: createdCards.map((c) => c.id),
    cardCount: cards.length,
    skipped: input.skipped ?? input.skippedLines?.length ?? 0,
    skippedLines: input.skippedLines,
    format,
    note,
  };
}

function portableCardToInput(c: PortableCard): NewCardInput {
  return {
    front: c.front,
    back: c.back,
    card_kind: c.card_kind ?? undefined,
    difficulty: c.difficulty ?? undefined,
    topic: c.topic ?? undefined,
    // Preserve the P0 TrustEnvelope on round-trip when present.
    ...(c.trust ? { metadata: { trust: c.trust } } : {}),
    // Re-attach media refs that already have a durable file id (same-account
    // round-trip; foreign file ids are refused by the edge write's RLS).
    ...(c.media?.some((m) => m.file_id)
      ? {
          media: c.media
            .filter((m) => !!m.file_id)
            .map((m) => ({
              file_id: m.file_id!,
              face: m.face,
              kind: m.kind,
              source_name: m.source_name,
            })),
        }
      : {}),
  };
}

/** Land a parsed portable deck: cards, then scheduling through the seed RPC. */
async function persistPortableDeck(parsed: ParsedPortableDeck): Promise<ImportOutcome> {
  const outcome = await persistImportedDeck({
    name: parsed.name,
    description: parsed.description,
    topic: parsed.topic,
    difficulty: parsed.difficulty,
    cards: parsed.cards.map(portableCardToInput),
    format: "json",
  });
  const seedItems = parsed.cards
    .map((c, i) => ({ sched: c.scheduling, cardId: outcome.cardIds[i] }))
    .filter((x): x is { sched: NonNullable<typeof x.sched>; cardId: string } => !!x.sched && !!x.cardId)
    .map((x) => ({ cardId: x.cardId, scheduling: x.sched, source: "matrx" }));
  const seeded = await seedImportedScheduling(seedItems);
  return seeded > 0
    ? {
        ...outcome,
        note: [outcome.note, `Review history restored for ${seeded} card${seeded === 1 ? "" : "s"} — due dates preserved.`]
          .filter(Boolean)
          .join(" "),
      }
    : outcome;
}

/** Import a Matrx portable-JSON export (round-trips deckFormats.buildDeckExport,
 * deck-level fields, trust, media refs, and review state included). */
export async function importPortableJson(raw: string): Promise<ImportOutcome> {
  const parsed = parseDeckJson(raw);
  if (!parsed) throw new Error("That doesn't look like a Matrx deck export.");
  return persistPortableDeck(parsed);
}

/** Cheap sniff: is this JSON text a whole-library export rather than one deck? */
export function looksLikeLibraryJson(text: string): boolean {
  try {
    const parsed = JSON.parse(text) as { sets?: unknown; cards?: unknown } | null;
    return !!parsed && typeof parsed === "object" && Array.isArray(parsed.sets) && !Array.isArray(parsed.cards);
  } catch {
    return false;
  }
}

/** Outcome of a multi-deck (library) import. */
export interface LibraryImportOutcome {
  decks: ImportOutcome[];
  failed: { name: string; error: string }[];
}

/** Import a whole-library JSON (`matrx-flashcards-library` — an array of
 * portable decks). Each deck lands independently; one bad deck never sinks
 * the rest. */
export async function importLibraryJson(raw: string): Promise<LibraryImportOutcome> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("That doesn't look like a Matrx library export.");
  }
  const sets =
    parsed && typeof parsed === "object" && Array.isArray((parsed as { sets?: unknown[] }).sets)
      ? (parsed as { sets: unknown[] }).sets
      : null;
  if (!sets) throw new Error("That doesn't look like a Matrx library export.");
  const decks: ImportOutcome[] = [];
  const failed: { name: string; error: string }[] = [];
  for (const s of sets) {
    const deck = parseDeckJson(JSON.stringify(s));
    if (!deck) {
      failed.push({ name: "(unreadable deck)", error: "no usable cards" });
      continue;
    }
    try {
      decks.push(await persistPortableDeck(deck));
    } catch (e) {
      failed.push({ name: deck.name, error: e instanceof Error ? e.message : "import failed" });
    }
  }
  if (decks.length === 0) {
    throw new Error("No decks could be imported from that library file.");
  }
  return { decks, failed };
}

/** Import the whole-library ZIP that "Export all" produces
 * (`matrx-flashcards/<name>.json` per deck + manifest). */
export async function importLibraryZip(file: File): Promise<LibraryImportOutcome> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const decks: ImportOutcome[] = [];
  const failed: { name: string; error: string }[] = [];
  const entries = Object.values(zip.files).filter(
    (f) => !f.dir && /\.json$/i.test(f.name) && !/(^|\/)manifest\.json$/i.test(f.name),
  );
  if (entries.length === 0) throw new Error("No deck files found in that zip.");
  for (const entry of entries) {
    const text = await entry.async("string");
    const deck = parseDeckJson(text);
    if (!deck) {
      failed.push({ name: entry.name, error: "not a readable deck file" });
      continue;
    }
    try {
      decks.push(await persistPortableDeck(deck));
    } catch (e) {
      failed.push({ name: deck.name, error: e instanceof Error ? e.message : "import failed" });
    }
  }
  if (decks.length === 0) {
    throw new Error("No decks could be imported from that zip.");
  }
  return { decks, failed };
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
    if (looksLikeLibraryJson(text)) {
      throw new Error(
        "That's a whole-library export — use the import panel's zip/library path (or call importLibraryJson), not a single-deck import.",
      );
    }
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
