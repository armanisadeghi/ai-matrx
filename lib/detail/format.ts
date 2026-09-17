// lib/detail/format.ts
//
// Generic row → fields formatting, lifted verbatim from the item detail
// window it replaced so every registry-known record renders exactly as it did.

import type { DetailField } from "./types";

/** Columns that are pure plumbing — hidden from a formatted field list. */
export const HIDDEN_FIELDS = new Set([
  "id",
  "user_id",
  "organization_id",
  "created_by",
  "updated_by",
  "embedding",
  "search_vector",
  "tsv",
]);

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

export function titleizeKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\bid\b/gi, "ID")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

export function formatValue(value: unknown): { text: string; mono?: boolean } | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return { text: value ? "Yes" : "No" };
  if (typeof value === "number") {
    return { text: Number.isFinite(value) ? value.toLocaleString() : String(value) };
  }
  if (typeof value === "string") {
    const t = value.trim();
    if (!t) return null;
    if (ISO_RE.test(t)) {
      const d = new Date(t);
      if (!Number.isNaN(d.getTime())) {
        return { text: d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) };
      }
    }
    return { text: t };
  }
  try {
    const json = JSON.stringify(value, null, 2);
    if (!json || json === "{}" || json === "[]") return null;
    return { text: json, mono: true };
  } catch {
    return { text: String(value), mono: true };
  }
}

/**
 * Every populated scalar column of a row as a field; a `<token>_id` column
 * holding a real uuid becomes a door (the host decides which token names a
 * registry entity — a wrong link is worse than no link).
 */
export function fieldsFromRow(
  row: Record<string, unknown>,
  doors: {
    tokenFromColumnName: (column: string) => string | null;
    isUuidValue: (value: unknown) => value is string;
  },
): DetailField[] {
  const out: DetailField[] = [];
  for (const [key, raw] of Object.entries(row)) {
    if (HIDDEN_FIELDS.has(key)) continue;
    const formatted = formatValue(raw);
    if (!formatted) continue;
    const token = doors.isUuidValue(raw) ? doors.tokenFromColumnName(key) : null;
    out.push({
      key,
      label: titleizeKey(key),
      text: formatted.text,
      mono: formatted.mono,
      ref: token ? { token, id: raw as string } : null,
    });
  }
  return out;
}

export function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}
