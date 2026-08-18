// features/education/onboard/export/deckFormats.ts
//
// Data-ownership export formats for a flashcard deck (P9 back door). Pure,
// DB-free format builders — the deck's {set, cards} in, a downloadable string
// out. Four formats:
//   • json   — full-fidelity Matrx format; round-trips via importDeckJson
//   • md      — human-readable Markdown (Q/A list), for reading/printing
//   • anki    — Anki-compatible TSV (front<TAB>back), imports natively into Anki
//   • csv     — front,back CSV (spreadsheet / Quizlet-compatible)
//
// "Anki-compatible" is the TSV Anki imports out of the box — no SQLite writing
// required, and lossless for front/back. (Reading .apkg is a separate import.)

import type { FcSetRow, CardWithDetails } from "@/features/flashcards/data/types";

export type DeckExportFormat = "json" | "md" | "anki" | "csv";

/** The portable, round-trippable Matrx deck shape (json export = this).
 * IC-11 (education-platform INTEGRATION_MAP): this is THE normalized shape every
 * importer produces — CSV, Matrx JSON, Anki, extension capture. Version 2 adds
 * optional per-card `scheduling` (imported review state) and `media` refs;
 * version-1 files parse unchanged. */
export interface PortableDeck {
  __format: "matrx.flashcards";
  version: 1 | 2;
  name: string;
  description: string | null;
  topic: string | null;
  difficulty: string | null;
  exported_at: string | null;
  cards: PortableCard[];
}

/** Imported spaced-repetition state for one card (Anki revlog / Matrx re-import).
 * Lands in the FSRS spine through the ONE sanctioned seed path — never written
 * to `item_mastery` by a client directly. */
export interface PortableScheduling {
  /** ISO timestamp the card is next due. */
  due_at: string;
  /** FSRS stability (days). For Anki imports, seeded from the last interval. */
  stability: number;
  /** FSRS difficulty (1..10). For Anki imports, derived from the ease factor. */
  difficulty: number;
  lapses: number;
  reps: number;
  /** ISO timestamp of the most recent review, if known. */
  last_review?: string | null;
}

/** A media file referenced by a card face (Anki embedded media, captures). */
export interface PortableMediaRef {
  /** Durable Matrx file id once uploaded; absent while still source-side. */
  file_id?: string;
  /** Original filename inside the source archive (e.g. Anki media map). */
  source_name?: string;
  /** Which face referenced it. */
  face?: "front" | "back";
  kind?: "image" | "audio" | "video";
}

export interface PortableCard {
  front: string;
  back: string;
  card_kind?: string | null;
  difficulty?: string | null;
  topic?: string | null;
  /** The P0 TrustEnvelope, preserved verbatim (opaque here). */
  trust?: unknown;
  /** v2: imported review state, so due dates survive a migration. */
  scheduling?: PortableScheduling | null;
  /** v2: media the card references. */
  media?: PortableMediaRef[] | null;
}

type ExportCard = Pick<
  CardWithDetails,
  "front" | "back" | "card_kind" | "difficulty" | "topic" | "metadata"
> & { id?: string };

/** Optional per-card state joined in at export time (keyed by card id). */
export interface DeckExportExtras {
  schedulingByCardId?: Map<string, PortableScheduling>;
  mediaByCardId?: Map<string, PortableMediaRef[]>;
}

function trustOf(card: ExportCard): unknown {
  const meta = card.metadata as Record<string, unknown> | null;
  return meta && typeof meta === "object" ? meta.trust : undefined;
}

export const EXPORT_MIME: Record<DeckExportFormat, string> = {
  json: "application/json;charset=utf-8;",
  md: "text/markdown;charset=utf-8;",
  anki: "text/tab-separated-values;charset=utf-8;",
  csv: "text/csv;charset=utf-8;",
};

export const EXPORT_EXT: Record<DeckExportFormat, string> = {
  json: "json",
  md: "md",
  anki: "txt", // Anki imports .txt TSV natively
  csv: "csv",
};

export const EXPORT_LABEL: Record<DeckExportFormat, string> = {
  json: "JSON (full fidelity)",
  md: "Markdown",
  anki: "Anki (.txt)",
  csv: "CSV",
};

/** Build the portable Matrx JSON object for a deck. `exportedAt` is caller-supplied
 * (no clock in pure code). */
export function toPortableDeck(
  set: Pick<FcSetRow, "name" | "description" | "topic" | "difficulty">,
  cards: ExportCard[],
  exportedAt: string | null,
  extras?: DeckExportExtras,
): PortableDeck {
  return {
    __format: "matrx.flashcards",
    version: 2,
    name: set.name,
    description: set.description ?? null,
    topic: set.topic ?? null,
    difficulty: set.difficulty ?? null,
    exported_at: exportedAt,
    cards: cards.map((c) => {
      const sched = c.id ? extras?.schedulingByCardId?.get(c.id) : undefined;
      const media = c.id ? extras?.mediaByCardId?.get(c.id) : undefined;
      return {
        front: c.front,
        back: c.back,
        card_kind: c.card_kind ?? null,
        difficulty: c.difficulty ?? null,
        topic: c.topic ?? null,
        trust: trustOf(c) ?? undefined,
        ...(sched ? { scheduling: sched } : {}),
        ...(media?.length ? { media } : {}),
      };
    }),
  };
}

function csvField(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Strip newlines/tabs for the single-line TSV/CSV columns Anki/Quizlet expect. */
function oneLine(v: string): string {
  return v.replace(/\r?\n/g, " ").replace(/\t/g, " ").trim();
}

export function buildDeckExport(
  set: Pick<FcSetRow, "name" | "description" | "topic" | "difficulty">,
  cards: ExportCard[],
  format: DeckExportFormat,
  exportedAt: string | null,
  extras?: DeckExportExtras,
): string {
  switch (format) {
    case "json":
      return JSON.stringify(toPortableDeck(set, cards, exportedAt, extras), null, 2);
    case "md": {
      const lines = [`# ${set.name}`];
      if (set.description) lines.push("", set.description);
      lines.push("");
      cards.forEach((c, i) => {
        lines.push(`## ${i + 1}. ${c.front}`, "", c.back, "");
      });
      return lines.join("\n");
    }
    case "anki":
      // Anki's default import: tab-separated, one note per line, front<TAB>back.
      return cards.map((c) => `${oneLine(c.front)}\t${oneLine(c.back)}`).join("\n");
    case "csv": {
      const rows = ["front,back"];
      for (const c of cards) rows.push(`${csvField(c.front)},${csvField(c.back)}`);
      return rows.join("\r\n");
    }
  }
}

/** Everything a portable-JSON parse recovers — deck-level fields included, so a
 * JSON export round-trips without dropping description/topic/difficulty. */
export interface ParsedPortableDeck {
  name: string;
  description: string | null;
  topic: string | null;
  difficulty: string | null;
  cards: PortableCard[];
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function parseScheduling(v: unknown): PortableScheduling | null {
  if (!v || typeof v !== "object") return null;
  const s = v as Record<string, unknown>;
  if (typeof s.due_at !== "string" || typeof s.stability !== "number") return null;
  return {
    due_at: s.due_at,
    stability: s.stability,
    difficulty: typeof s.difficulty === "number" ? s.difficulty : 5,
    lapses: typeof s.lapses === "number" ? s.lapses : 0,
    reps: typeof s.reps === "number" ? s.reps : 0,
    last_review: typeof s.last_review === "string" ? s.last_review : null,
  };
}

/**
 * Parse a Matrx portable-JSON export back into a deck (round-trip import).
 * Accepts v1 and v2 exports and is tolerant of a bare
 * `{name, cards:[{front,back}]}`. Returns null if it can't find usable cards.
 */
export function parseDeckJson(raw: string): ParsedPortableDeck | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  let obj = parsed as Record<string, unknown>;
  // Tolerant reader: some exports nested deck fields under `set:{}`
  // (flashcards exportDeck.ts before it delegated here) — flatten them.
  if (!obj.name && obj.set && typeof obj.set === "object") {
    obj = { ...(obj.set as Record<string, unknown>), cards: obj.cards };
  }
  const rawCards = Array.isArray(obj.cards) ? obj.cards : [];
  const cards: PortableCard[] = [];
  for (const rc of rawCards) {
    if (!rc || typeof rc !== "object") continue;
    const r = rc as Record<string, unknown>;
    const front = typeof r.front === "string" ? r.front.trim() : "";
    const back = typeof r.back === "string" ? r.back.trim() : "";
    if (!front && !back) continue;
    cards.push({
      front,
      back,
      card_kind: typeof r.card_kind === "string" ? r.card_kind : null,
      difficulty: typeof r.difficulty === "string" ? r.difficulty : null,
      topic: typeof r.topic === "string" ? r.topic : null,
      trust: r.trust,
      scheduling: parseScheduling(r.scheduling),
      media: Array.isArray(r.media) ? (r.media as PortableMediaRef[]) : null,
    });
  }
  if (cards.length === 0) return null;
  return {
    name: str(obj.name) ?? "Imported deck",
    description: str(obj.description),
    topic: str(obj.topic),
    difficulty: str(obj.difficulty),
    cards,
  };
}
