/**
 * WHICH COLUMN A PASTED HEADER MEANS (lane DATA-V2-BASICS, 2026-09-27; BREAKER-1 F10).
 *
 * The Sheet's Paste matched a header to a column by the column's INTERNAL KEY only. A column's key
 * is fixed when it is made and its name is not: rename "Discount Percent" to "Fee Percent", add a
 * new "Discount Percent", and a pasted "Discount Percent" header landed in "Fee Percent" (key
 * `discount_percent`) while the real "Discount Percent" was marked "will be empty" — measured on
 * production. BREAKER-1 lost a whole column of 500 rows the same way.
 *
 * THE RULE (Sheets, Airtable: a header is matched by the column's NAME):
 *   1. a header matches the column whose name reads the same (letter case and spacing aside);
 *   2. only a header no name matched falls back to the key it spells, and only onto a column no
 *      other header has already taken by name;
 *   3. a name two columns share matches neither — it is ambiguous, and the dialog says so;
 *   4. no column is ever filled from two headers.
 *
 * Pure: no React.
 */
import { sanitizeFieldName } from "./field-name-key";

export interface PasteMatchField {
  field_name: string;
  display_name: string;
}

export interface PasteHeaderMatch<F extends PasteMatchField> {
  pasteHeader: string;
  matchedField: F | null;
  /** Set when the header was not matched for a reason the person should read. */
  why?: string;
}

const sameWords = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

export function matchPasteHeaders<F extends PasteMatchField>(headers: readonly string[], fields: readonly F[]): PasteHeaderMatch<F>[] {
  const byName = new Map<string, F[]>();
  for (const f of fields) {
    const k = sameWords(f.display_name || f.field_name);
    byName.set(k, [...(byName.get(k) ?? []), f]);
  }
  const taken = new Set<string>();
  const out: PasteHeaderMatch<F>[] = headers.map((pasteHeader) => ({ pasteHeader, matchedField: null }));
  // 1 + 3: by name.
  headers.forEach((header, i) => {
    const named = byName.get(sameWords(header)) ?? [];
    if (named.length > 1) {
      out[i] = { pasteHeader: header, matchedField: null, why: `${named.length} columns are called "${header.trim()}" — rename one, then paste again` };
      return;
    }
    const [only] = named;
    if (only && !taken.has(only.field_name)) {
      taken.add(only.field_name);
      out[i] = { pasteHeader: header, matchedField: only };
    }
  });
  // 2: by the key it spells, onto a column nothing took by name.
  headers.forEach((header, i) => {
    if (out[i]!.matchedField || out[i]!.why) return;
    const key = sanitizeFieldName(header);
    const hit = fields.find((f) => f.field_name === key);
    if (hit && !taken.has(hit.field_name)) {
      taken.add(hit.field_name);
      out[i] = { pasteHeader: header, matchedField: hit };
    }
  });
  return out;
}
