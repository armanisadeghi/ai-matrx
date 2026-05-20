/**
 * Blind-test helpers.
 *
 * Anonymized labels are derived purely from a column's position in the
 * shuffled `order` array (the source of truth in the blind slice state).
 * "Response A", "Response B", … wrapping to "Response Z", then numeric
 * "Response 27" beyond 26 columns (no realistic comparison hits that).
 */

/**
 * Anonymous label for a column during a blind test, by its index in the
 * shuffled order. Returns "Response ?" if the column isn't in the order
 * (shouldn't happen — defensive).
 */
export function blindAnonLabel(
  columnId: string,
  order: string[],
): string {
  const idx = order.indexOf(columnId);
  if (idx < 0) return "Response ?";
  return `Response ${blindLetter(idx)}`;
}

/** A, B, … Z, then 27, 28, … */
export function blindLetter(index: number): string {
  if (index < 26) return String.fromCharCode(65 + index);
  return String(index + 1);
}

/**
 * Fisher–Yates shuffle of a copy of the input ids. Pure — never mutates
 * the input. Used by the submit handler to generate the blind order.
 */
export function shuffleIds(ids: string[]): string[] {
  const out = [...ids];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
