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

/**
 * THE PASTED COLUMN THAT NAMES EACH RECORD GOES TO THE TABLE'S NAME COLUMN (BREAKER-3 B3-08).
 *
 * A paste headed `Patient, Referring Doctor, …` into a table whose name column is "Title" skipped
 * Patient and left Title "will be empty": every pasted record landed with no name. The records-ui
 * ImportWizard's "What each record is called" rule, mirrored (FIX-11B F2, VERIFIER-30 #2):
 *   1. only when no header already landed on the name column, and only among headers nothing
 *      else matched (never a header a column of its own name claimed, never an ambiguous one);
 *   2. a header that says it is the name — Title, Name, Patient, Customer, … — wins;
 *   3. else the worded column whose values differ most (a name is words and tells rows apart; a
 *      column of floors "1", "1", "Lower" names nothing), the first such column breaking ties;
 *   4. else nothing is guessed — a column of numbers is not a name.
 * The guess is shown on the confirm screen and the person can change it (`choosePasteColumn`).
 */
const SAYS_IT_IS_THE_NAME =
  /^(title|name|record|customer|client|company|job|item|subject|label|description|room|patient|product|task|project)\b|(\bname|\btitle)$/i;

export function fillNameColumn<F extends PasteMatchField>(
  matches: readonly PasteHeaderMatch<F>[],
  nameField: F | null | undefined,
  rows: ReadonlyArray<Record<string, unknown>> = [],
): PasteHeaderMatch<F>[] {
  const out = [...matches];
  if (!nameField || out.some((m) => m.matchedField?.field_name === nameField.field_name)) return out;
  const open = out.map((m, i) => ({ m, i })).filter(({ m }) => !m.matchedField && !m.why);
  const said = open.find(({ m }) => SAYS_IT_IS_THE_NAME.test(m.pasteHeader.trim()));
  let pick = said?.i ?? -1;
  if (pick < 0) {
    let best = 0;
    for (const { m, i } of open) {
      const values = rows.map((r) => String(r[m.pasteHeader] ?? "").trim()).filter(Boolean);
      const worded = values.filter((v) => !/^[\d\s.,:$%-]+$/.test(v));
      const score = new Set(worded.map((v) => v.toLowerCase())).size;
      if (score > best) {
        best = score;
        pick = i;
      }
    }
  }
  if (pick >= 0) out[pick] = { pasteHeader: out[pick]!.pasteHeader, matchedField: nameField };
  return out;
}

/**
 * The person's own choice for one pasted column: a table column, or `null` for Skip. A table
 * column is never filled from two pasted columns, so choosing it here takes it from any other.
 */
export function choosePasteColumn<F extends PasteMatchField>(
  matches: readonly PasteHeaderMatch<F>[],
  pasteHeader: string,
  field: F | null,
): PasteHeaderMatch<F>[] {
  return matches.map((m) => {
    if (m.pasteHeader === pasteHeader) return { pasteHeader, matchedField: field };
    if (field && m.matchedField?.field_name === field.field_name) return { pasteHeader: m.pasteHeader, matchedField: null };
    return m;
  });
}
