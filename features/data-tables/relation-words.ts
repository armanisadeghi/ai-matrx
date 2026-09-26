/**
 * relation-words — THE ONE CLIENT PATH that turns a `relation` cell's stored ID
 * into the WORDS a person reads, for the OLDER user-data tables. THE PURE HALF.
 *
 * A `relation` column stores a record's identifier and shows that record's
 * name. TEN readers print the contents of a cell — the grid, formulas, the
 * column filter checklist, copy/paste/export, the row label, sorting, what an
 * agent is told about the table, `@table_cell`, the CMS export and the server's
 * distinct-values endpoint — and every one of them would show a customer a raw
 * uuid. OLD-TABLES-CUTOVER rev 2 §3.3 ruled that this is ONE fix and not ten:
 * every reader resolves through the same lookup, and this module is where that
 * lookup is APPLIED. Where it comes FROM is `relation-words-client.tsx`.
 *
 * THIS HALF IS PURE AND HAS NO "use client" — `row-label.ts`, `formulas.ts`,
 * `table-copy.ts` and the agent scope are plain modules that run on the server
 * too, and a reader that had to become a client component to resolve a chip
 * would not be one path, it would be a fork.
 *
 * THE THREE STATES (`lib/field-formats/relation`):
 *   resolved      → the words.
 *   withheld      → `platform.relation_withheld_label()`, with NO id.
 *   unresolvable  → the id is ABSENT from the map and the reader shows the
 *                   identifier, marked as one. An absent id is therefore
 *                   MEANINGFUL and is never filled in with "Untitled".
 */

import { RELATION_WITHHELD_LABEL, looksLikeRecordId } from "@/lib/field-formats/relation";
import type { FieldFormatConfig } from "@ai-matrx/design-system/field-formats";

/** id → the words that id reads. An id the store answered nothing for is ABSENT. */
export type RelationWordsMap = ReadonlyMap<string, string>;

/** machine field name → that column's lookup. */
export type RelationWordsByField = ReadonlyMap<string, RelationWordsMap>;


/** A column whose cell holds an identifier of a row in another older table. */
export function isRelationFormat(id: string | undefined | null): boolean {
  return id === "relation";
}

/** Every id a `relation` cell in these rows points at, de-duplicated, in order. */
export function relationIdsInColumn(
  rows: readonly { data?: Record<string, unknown> | null }[],
  fieldName: string,
): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    const raw = row?.data?.[fieldName];
    const values = Array.isArray(raw) ? raw : [raw];
    for (const v of values) {
      if (typeof v !== "string") continue;
      const id = v.trim();
      if (id && looksLikeRecordId(id)) seen.add(id);
    }
  }
  return [...seen];
}

/**
 * WHAT ONE CELL READS — the pure function every non-React reader calls.
 *
 * `copy`, the row label, the sort comparator, the agent scope and the formula
 * evaluator all reach a relation cell as a raw value with a lookup in hand, and
 * every one of them wants the same answer, so the answer is written once here.
 *
 * A multi-valued cell (`relation_max` > 1) joins its parts with ", " — the same
 * separator `multi_choice` already uses when a cell becomes one string.
 */
export function relationCellText(value: unknown, words: RelationWordsMap | undefined): string {
  const parts = Array.isArray(value) ? value : [value];
  const out: string[] = [];
  for (const part of parts) {
    if (part === null || part === undefined) continue;
    const raw = String(part).trim();
    if (!raw) continue;
    const resolved = words?.get(raw);
    // Resolved → the words. Withheld → the sentence (which IS the words the
    // door returned). Unresolvable → the identifier, marked as one, never bare.
    if (typeof resolved === "string") out.push(resolved);
    else out.push(looksLikeRecordId(raw) ? `Record ${raw.slice(0, 8)}` : raw);
  }
  return out.join(", ");
}

/**
 * The same answer for ANY cell, so a reader never has to ask what kind of
 * column it is holding: a non-relation column is handed straight back and a
 * relation column is resolved. This is what makes "every reader goes through
 * one path" true rather than aspirational.
 */
export function cellTextForReader(
  value: unknown,
  format: FieldFormatConfig | null | undefined,
  wordsByField: RelationWordsByField | undefined,
  fieldName: string,
): unknown {
  if (!isRelationFormat(format?.id)) return value;
  return relationCellText(value, wordsByField?.get(fieldName));
}

/** True when the words a reader was handed are the store's refusal rather than a name. */
export function isWithheldWords(words: string | undefined | null): boolean {
  return typeof words === "string" && words.trim() === RELATION_WITHHELD_LABEL;
}

/** A relation column's declared display spec, for a caller that has only the format. */
export function relationDisplayOf(format: FieldFormatConfig | null | undefined): unknown {
  if (!isRelationFormat(format?.id)) return null;
  return (format?.options as Record<string, unknown> | undefined)?.display ?? null;
}
