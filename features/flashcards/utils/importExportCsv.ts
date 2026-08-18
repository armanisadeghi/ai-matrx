// features/flashcards/utils/importExportCsv.ts
//
// Phase 1A (Flashcards Competitive Parity Push) — CSV/TSV import & export.
// Pure, DB-free parsing/formatting utilities consumed by
// `components/import/ImportSetView.tsx` (import), `SetDetailView.tsx`
// (export), and `features/education/onboard/import/importDeck.ts` (the IC-11
// import entry). Reference-only relationship to
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

/** One skipped source line, reported with its position — never guessed at. */
export interface SkippedLine {
  line: number;
  text: string;
}

export interface ParseImportResult {
  rows: ParsedImportRow[];
  /** Lines that had no usable delimiter/second field, skipped rather than guessed. */
  skipped: SkippedLine[];
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

/**
 * RFC-4180 CSV parser for FILE imports — the exact shape our own CSV export
 * writes: quoted fields containing commas, escaped quotes (`""`), and embedded
 * newlines all survive. A leading `front,back`-style header row is skipped.
 * (Paste-style line imports keep using `parseImportText`, which is tolerant of
 * mixed delimiters but is deliberately NOT quote-aware.)
 */
export function parseCsvRecords(text: string): ParseImportResult {
  const records: { fields: string[]; line: number }[] = [];
  let field = "";
  let fields: string[] = [];
  let inQuotes = false;
  let line = 1;
  let recordStartLine = 1;

  const endField = () => {
    fields.push(field);
    field = "";
  };
  const endRecord = () => {
    endField();
    if (fields.some((f) => f.trim() !== "")) {
      records.push({ fields, line: recordStartLine });
    }
    fields = [];
    recordStartLine = line;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === "\n") line++;
        field += ch;
      }
    } else if (ch === '"' && field === "") {
      inQuotes = true;
    } else if (ch === ",") {
      endField();
    } else if (ch === "\r") {
      if (text[i + 1] === "\n") i++;
      line++;
      endRecord();
    } else if (ch === "\n") {
      line++;
      endRecord();
    } else {
      field += ch;
    }
  }
  if (field !== "" || fields.length > 0) endRecord();

  const rows: ParsedImportRow[] = [];
  const skipped: SkippedLine[] = [];
  records.forEach((rec, idx) => {
    const [front = "", back = "", ...rest] = rec.fields;
    // Skip a header row like `front,back` / `term,definition` at the top.
    if (
      idx === 0 &&
      /^(front|term|question)$/i.test(front.trim()) &&
      /^(back|definition|answer)$/i.test(back.trim())
    ) {
      return;
    }
    const fullBack = rest.length > 0 ? [back, ...rest].join("\n").trim() : back.trim();
    if (!front.trim() || !fullBack) {
      skipped.push({ line: rec.line, text: rec.fields.join(",").slice(0, 200) });
      return;
    }
    rows.push({ front: front.trim(), back: fullBack, line: rec.line });
  });
  return { rows, skipped };
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
