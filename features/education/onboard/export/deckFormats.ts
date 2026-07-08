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

/** The portable, round-trippable Matrx deck shape (json export = this). */
export interface PortableDeck {
  __format: "matrx.flashcards";
  version: 1;
  name: string;
  description: string | null;
  topic: string | null;
  difficulty: string | null;
  exported_at: string | null;
  cards: PortableCard[];
}

export interface PortableCard {
  front: string;
  back: string;
  card_kind?: string | null;
  difficulty?: string | null;
  topic?: string | null;
  /** The P0 TrustEnvelope, preserved verbatim (opaque here). */
  trust?: unknown;
}

type ExportCard = Pick<
  CardWithDetails,
  "front" | "back" | "card_kind" | "difficulty" | "topic" | "metadata"
>;

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
): PortableDeck {
  return {
    __format: "matrx.flashcards",
    version: 1,
    name: set.name,
    description: set.description ?? null,
    topic: set.topic ?? null,
    difficulty: set.difficulty ?? null,
    exported_at: exportedAt,
    cards: cards.map((c) => ({
      front: c.front,
      back: c.back,
      card_kind: c.card_kind ?? null,
      difficulty: c.difficulty ?? null,
      topic: c.topic ?? null,
      trust: trustOf(c) ?? undefined,
    })),
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
): string {
  switch (format) {
    case "json":
      return JSON.stringify(toPortableDeck(set, cards, exportedAt), null, 2);
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

/**
 * Parse a Matrx portable-JSON export back into cards (round-trip import). Accepts
 * our export shape and is tolerant of a bare `{name, cards:[{front,back}]}`.
 * Returns null if it can't find any usable cards.
 */
export function parseDeckJson(
  raw: string,
): { name: string; cards: PortableCard[] } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
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
    });
  }
  if (cards.length === 0) return null;
  const name =
    typeof obj.name === "string" && obj.name.trim() ? obj.name.trim() : "Imported deck";
  return { name, cards };
}
