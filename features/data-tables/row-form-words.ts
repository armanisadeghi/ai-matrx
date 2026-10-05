/**
 * WHAT A PERSON TYPED INTO A ROW FORM'S NUMBER BOX, READ BY THE ONE READER OF A WORD (grids review 3,
 * 2026-09-30).
 *
 * The "+ Row" and row-edit forms drew a Number or Money column as the browser's number control, which
 * cannot hold "(150)", "$1,250.50" or "-$150" at all — the keys were refused or the box read them as
 * nothing, and the column was saved empty. The box is now a text box that keeps exactly what was
 * typed, and the form reads it here, on Save, through `readCellWord` — the reader a typed Sheet cell,
 * a paste and a column's default use. A word it cannot read is refused beside its field, never saved
 * as empty.
 */
import { resolveFieldFormat } from "@ai-matrx/design-system/field-formats";

import { readCellWord, type CellWordColumn } from "./cell-word";

const NUMBER_LOOKS = new Set(["number", "decimal", "integer", "currency", "percent", "progress", "duration", "file_size"]);

/** Does this column take a number a person types into a text box? */
export function isTypedNumberColumn(field: CellWordColumn): boolean {
  if (field.data_type === "number" || field.data_type === "integer") return true;
  return NUMBER_LOOKS.has(resolveFieldFormat(field.data_type, field.metadata).id);
}

export function readRowFormWords<F extends CellWordColumn & { field_name: string }>(
  fields: readonly F[],
  data: Readonly<Record<string, unknown>>,
): { data: Record<string, unknown>; refusals: Record<string, string> } {
  const out: Record<string, unknown> = { ...data };
  const refusals: Record<string, string> = {};
  for (const field of fields) {
    const value = data[field.field_name];
    if (typeof value !== "string" || !isTypedNumberColumn(field)) continue;
    const read = readCellWord(value, field);
    if (read.ok) out[field.field_name] = read.value;
    else refusals[field.field_name] = read.why;
  }
  return { data: out, refusals };
}
