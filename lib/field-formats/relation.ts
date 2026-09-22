/**
 * lib/field-formats/relation — the three states a `relation` cell can be in,
 * in ONE place, so no reader invents a fourth.
 *
 * A `relation` cell stores a RECORD'S ID and shows that record's WORDS. There
 * are exactly three things that can be true of it, and OLD-TABLES-CUTOVER §3.3
 * rules each one's rendering:
 *
 *   RESOLVED      the target's words.
 *
 *   UNRESOLVABLE  the amber fallback **with the id**, shown as an identifier —
 *                 never a blank, and never the bare uuid printed as if it were
 *                 text. The person can act on it and support can trace it. This
 *                 is the fallback law ("a format may never blank a cell or
 *                 throw") and "a screen never lies" satisfied together; a bare
 *                 uuid satisfies neither, because it reads as the cell's
 *                 contents rather than as a reference that did not resolve.
 *
 *   WITHHELD      `platform.relation_withheld_label()` — the same sentence,
 *                 with **no id**. A reader who may not see the target must not
 *                 learn its identifier, and the sentence reads identically
 *                 whichever store refused, so nobody can tell the two apart and
 *                 no id leaks through the gap between them.
 *
 * WHY THE SENTENCE IS DUPLICATED HERE. It is authored in the database by
 * `platform.relation_withheld_label()` and arrives in the resolved words, so
 * this constant is a RECOGNISER, not a second author: the renderer needs to
 * know that the words it was handed are a refusal rather than a name, so that
 * it can drop the id it would otherwise show beside them. If the database's
 * sentence ever changes, this recogniser stops matching and a withheld cell
 * degrades to the unresolvable rendering — visibly wrong, never silently
 * leaking — which is the right way round for a mistake to fall.
 */

/** The sentence `platform.relation_withheld_label()` returns, verbatim. */
export const RELATION_WITHHELD_LABEL = "A record you have not been given access to";

export type RelationCellState = "resolved" | "unresolvable" | "withheld";

/** A canonical uuid, which is the only shape a relation cell may store. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function looksLikeRecordId(value: unknown): boolean {
  return typeof value === "string" && UUID.test(value.trim());
}

/**
 * Which of the three states a cell is in, given the stored value and whatever
 * the resolver turned it into. `words` is null/undefined when nothing resolved.
 */
export function relationCellState(
  stored: unknown,
  words: string | null | undefined,
): RelationCellState {
  if (typeof words === "string" && words.trim() === RELATION_WITHHELD_LABEL) {
    return "withheld";
  }
  if (typeof words === "string" && words.trim() !== "") return "resolved";
  return "unresolvable";
}

/**
 * What an UNRESOLVABLE cell shows: the identifier, marked as an identifier.
 * Short enough to sit in a grid cell, long enough to find the row it names —
 * a uuid's first segment is 8 hex digits, which is 4 billion values and is what
 * every support conversation actually quotes.
 */
export function unresolvedRelationText(stored: unknown): string {
  const raw = typeof stored === "string" ? stored.trim() : String(stored ?? "");
  if (!raw) return "";
  return looksLikeRecordId(raw) ? `Record ${raw.slice(0, 8)}` : raw;
}

/** The full identifier, for the title attribute and for copy. */
export function unresolvedRelationTitle(stored: unknown): string {
  const raw = typeof stored === "string" ? stored.trim() : String(stored ?? "");
  return (
    `This cell points at a record that could not be resolved. Its identifier is ${raw}. ` +
    `The record may have been archived, or it may live in a table this column no longer points at.`
  );
}
