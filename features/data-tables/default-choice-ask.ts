/**
 * A CHOICE COLUMN'S DEFAULT THAT IS NONE OF ITS CHOICES IS ASKED, NEVER TAKEN IN SILENCE
 * (lane DATA-V2-BASICS-2, BREAKER-3 B3-14 / BREAKER-2 B2-14, 2026-09-30).
 *
 * MEASURED: Add Column, Shows as Choice, options Routine / Urgent / Elective, Default "Rutine". The
 * column takes other values (a Choice column made here does, unless the person turns that off), so
 * neither the dialog nor the store had anything to refuse — and every new row was stamped "Rutine",
 * a word nobody chose, drawn orange, with a Kanban column of its own. A strict column still refuses
 * (the store does too: custom._field_default_fitted). An open column now gets the SAME question a
 * cell gets for an unknown word (ChoiceNudgeAsk): Add it to the choices, Keep it as typed, or Cancel.
 */
import type { FieldFormatConfig } from "@ai-matrx/design-system/field-formats";
import { inlineChoices } from "@/lib/field-formats/choices";
import { offListChoiceWords, takesOtherWords, type CellWordColumn } from "./cell-word";

/** The key a "Keep as typed" answer is remembered under: the exact words it was given for. */
export function keptKey(words: readonly string[]): string {
  return words.join("\u0000");
}

/**
 * The words the dialog must ask about before the column is made, or null when there is nothing to
 * ask: no default, a strict column (its refusal is `defaultProblem`'s, not a question), or words
 * the person already answered "Keep as typed" for.
 */
export function defaultChoiceAsk(
  value: unknown,
  column: CellWordColumn,
  kept: string | null,
): string[] | null {
  const off = offListChoiceWords(value, column);
  if (off.length === 0 || !takesOtherWords(column)) return null;
  if (kept !== null && kept === keptKey(off)) return null;
  return off;
}

/** The column's format with `words` added to its choices, in the order typed, after the ones it has. */
export function withChoicesAdded(format: FieldFormatConfig, words: readonly string[]): FieldFormatConfig {
  const have = inlineChoices(format.options);
  const seen = new Set(have.map((c) => c.value.trim().toLocaleLowerCase()));
  const added = words
    .map((w) => w.trim())
    .filter((w) => w !== "" && !seen.has(w.toLocaleLowerCase()))
    .map((value) => ({ value }));
  if (added.length === 0) return format;
  return { ...format, options: { ...(format.options ?? {}), choices: [...have, ...added] } };
}
