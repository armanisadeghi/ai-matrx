// features/flashcards/utils/importExportCsv.ts
//
// Phase 1A (Flashcards Competitive Parity Push) — CSV/TSV import & export.
// Pure, DB-free parsing/formatting utilities consumed by
// `components/import/ImportSetDialog.tsx` (import) and `SetDetailView.tsx`
// (export). Reference-only relationship to
// `components/mardown-display/blocks/flashcards/flashcard-parser.ts` — that
// parser is chat-block-scoped and NOT imported here (per the plan).
//
// Quizlet's classic "paste" format is: one card per line, term/definition
// separated by a delimiter (tab by default, comma as an alternative), with an
// optional secondary delimiter between CARDS (default: newline).

import type { FcSetRow, NewCardInput, CardWithDetails } from "../data/types";

export type FieldDelimiter = "tab" | "comma" | "semicolon";
export type RowDelimiter = "newline";

export const FIELD_DELIMITER_VALUES: Record<FieldDelimiter, string> = {
  tab: "\t",
  comma: ",",
  semicolon: ";",
};

export interface ParsedImportRow {
  front: string;
  back: string;
  /** Original 1-based line number, for surfacing which line a skip came from. */
  line: number;
}

export interface ParseImportResult {
  rows: ParsedImportRow[];
  /** Lines that had no usable delimiter/second field, skipped rather than guessed. */
  skipped: { line: number; text: string }[];
}

/**
 * Split raw pasted/uploaded text into front/back pairs. Tries the requested
 * field delimiter first, then falls back to the other common ones per-line so
 * a mixed paste (e.g. Quizlet exports tab, but a row has a comma) still
 * imports as much as possible.
 */
export function parseImportText(
  text: string,
  fieldDelimiter: FieldDelimiter = "tab",
): ParseImportResult {
  const primary = FIELD_DELIMITER_VALUES[fieldDelimiter];
  const fallbacks = Object.values(FIELD_DELIMITER_VALUES).filter(
    (d) => d !== primary,
  );
  const lines = text.split(/\r\n|\r|\n/);
  const rows: ParsedImportRow[] = [];
  const skipped: { line: number; text: string }[] = [];

  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    let parts = splitOnce(line, primary);
    if (!parts) {
      for (const fb of fallbacks) {
        parts = splitOnce(line, fb);
        if (parts) break;
      }
    }
    if (!parts) {
      skipped.push({ line: i + 1, text: line });
      return;
    }
    const [front, back] = parts;
    if (!front.trim() || !back.trim()) {
      skipped.push({ line: i + 1, text: line });
      return;
    }
    rows.push({ front: front.trim(), back: back.trim(), line: i + 1 });
  });

  return { rows, skipped };
}

/** Split on the FIRST occurrence of `delim` only (so a definition containing
 * more delimiters is preserved intact rather than truncated). */
function splitOnce(line: string, delim: string): [string, string] | null {
  const idx = line.indexOf(delim);
  if (idx < 0) return null;
  return [line.slice(0, idx), line.slice(idx + delim.length)];
}

export function parsedRowsToCardInputs(
  rows: ParsedImportRow[],
): NewCardInput[] {
  return rows.map((r) => ({ front: r.front, back: r.back }));
}

/** CSV-escape one field (RFC 4180: wrap in quotes if it holds a comma, quote, or newline). */
function csvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Build a downloadable CSV string (`front,back` header + one row per card). */
export function buildSetCsv(cards: Pick<CardWithDetails, "front" | "back">[]): string {
  const lines = ["front,back"];
  for (const c of cards) {
    lines.push(`${csvField(c.front)},${csvField(c.back)}`);
  }
  return lines.join("\r\n");
}

/** Trigger a browser download of the set's cards as CSV. Client-only. */
export function downloadSetCsv(set: FcSetRow, cards: Pick<CardWithDetails, "front" | "back">[]): void {
  const csv = buildSetCsv(cards);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeName = set.name.trim().replace(/[^\w\- ]+/g, "").replace(/\s+/g, "_") || "flashcard_set";
  a.href = url;
  a.download = `${safeName}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
