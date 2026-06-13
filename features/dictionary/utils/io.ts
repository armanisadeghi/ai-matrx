// features/dictionary/utils/io.ts
//
// Import/export for the dictionary manager's "advanced" path: CSV (with a
// downloadable template) and JSON. Parsing reuses papaparse (the same library
// components/user-generated-table-data/ImportTableModal.tsx uses). All output
// is a list of DictEntryDraft ready for dictionaryService.upsertEntries.

import Papa from "papaparse";
import type { DictEntry, DictEntryDraft } from "@/features/dictionary/types";

/** Canonical column order for CSV import/export + the template. */
export const DICT_CSV_COLUMNS = [
  "term",
  "sounds_like",
  "pronunciation",
  "ipa",
  "definition",
  "category",
  "is_active",
] as const;

/** sounds_like is a list; we serialise it pipe-delimited inside one CSV cell. */
const SOUNDS_LIKE_DELIM = "|";

function splitSoundsLike(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(SOUNDS_LIKE_DELIM)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseBool(raw: string | undefined | null): boolean {
  if (raw == null || raw === "") return true; // default active
  return !["false", "0", "no", "n", "off"].includes(raw.trim().toLowerCase());
}

export interface DictImportResult {
  drafts: DictEntryDraft[];
  /** Row-level problems that were skipped (1-based row number + reason). */
  skipped: Array<{ row: number; reason: string }>;
}

/** Parse a CSV string into entry drafts. Tolerant of header case/order. */
export function parseDictCsv(csv: string): DictImportResult {
  const drafts: DictEntryDraft[] = [];
  const skipped: Array<{ row: number; reason: string }> = [];

  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  parsed.data.forEach((row, i) => {
    const rowNum = i + 2; // +1 header, +1 to 1-base
    const term = (row.term ?? "").trim();
    if (!term) {
      skipped.push({ row: rowNum, reason: "missing term" });
      return;
    }
    drafts.push({
      term,
      sounds_like: splitSoundsLike(row.sounds_like),
      pronunciation: (row.pronunciation ?? "").trim() || null,
      ipa: (row.ipa ?? "").trim() || null,
      definition: (row.definition ?? "").trim() || null,
      category: (row.category ?? "").trim() || null,
      is_active: parseBool(row.is_active),
    });
  });

  return { drafts, skipped };
}

/** Parse a JSON string (array of entry-like objects) into drafts. */
export function parseDictJson(json: string): DictImportResult {
  const drafts: DictEntryDraft[] = [];
  const skipped: Array<{ row: number; reason: string }> = [];

  let arr: unknown;
  try {
    arr = JSON.parse(json);
  } catch (e) {
    throw new Error(`Invalid JSON: ${(e as Error).message}`);
  }
  if (!Array.isArray(arr)) throw new Error("JSON must be an array of entries.");

  arr.forEach((raw, i) => {
    const rowNum = i + 1;
    const obj = raw as Record<string, unknown>;
    const term = typeof obj.term === "string" ? obj.term.trim() : "";
    if (!term) {
      skipped.push({ row: rowNum, reason: "missing term" });
      return;
    }
    const soundsLike = Array.isArray(obj.sounds_like)
      ? (obj.sounds_like as unknown[]).map((s) => String(s).trim()).filter(Boolean)
      : splitSoundsLike(typeof obj.sounds_like === "string" ? obj.sounds_like : "");
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    drafts.push({
      term,
      sounds_like: soundsLike,
      pronunciation: str(obj.pronunciation),
      ipa: str(obj.ipa),
      definition: str(obj.definition),
      category: str(obj.category),
      is_active: typeof obj.is_active === "boolean" ? obj.is_active : true,
    });
  });

  return { drafts, skipped };
}

/** Serialise entries to a CSV string (same columns as the template). */
export function entriesToCsv(entries: DictEntry[]): string {
  const rows = entries.map((e) => ({
    term: e.term,
    sounds_like: e.sounds_like.join(SOUNDS_LIKE_DELIM),
    pronunciation: e.pronunciation ?? "",
    ipa: e.ipa ?? "",
    definition: e.definition ?? "",
    category: e.category ?? "",
    is_active: e.is_active ? "true" : "false",
  }));
  return Papa.unparse({ fields: [...DICT_CSV_COLUMNS], data: rows });
}

/** Serialise entries to a pretty JSON string. */
export function entriesToJson(entries: DictEntry[]): string {
  return JSON.stringify(
    entries.map((e) => ({
      term: e.term,
      sounds_like: e.sounds_like,
      pronunciation: e.pronunciation,
      ipa: e.ipa,
      definition: e.definition,
      category: e.category,
      is_active: e.is_active,
    })),
    null,
    2,
  );
}

/** The downloadable CSV template — header + two illustrative example rows. */
export function dictCsvTemplate(): string {
  return Papa.unparse({
    fields: [...DICT_CSV_COLUMNS],
    data: [
      {
        term: "Rejuvina",
        sounds_like: "rejuvena|rejuvinah",
        pronunciation: "reh-juh-VEE-nah",
        ipa: "ɹɛdʒəˈvinə",
        definition: "Our flagship skincare product line",
        category: "Products",
        is_active: "true",
      },
      {
        term: "Dr. Nazarian",
        sounds_like: "doctor nazaryan|nazaryan",
        pronunciation: "nuh-ZAR-ee-un",
        ipa: "",
        definition: "Lead physician",
        category: "People",
        is_active: "true",
      },
    ],
  });
}

/** Trigger a client-side download of text content as a named file. */
export function downloadTextFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
