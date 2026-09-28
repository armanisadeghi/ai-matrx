/**
 * THE WORD A ROW FORM SHOWS BESIDE A COLUMN'S NAME (DATA-V2-BASICS-2, F33).
 *
 * The Sheet's Add New Row and Edit Row forms printed the storage type beside every label —
 * "string", "number", "datetime" — the database's word, not the person's. A column reads as what
 * it shows as: "Text", "Choice", "Date & time", "Currency" (the column's own format, the name the
 * Add column dialog offered). A column with no format of its own reads by its storage kind in
 * plain words.
 */
import { getFieldFormat, resolveFieldFormat } from "@ai-matrx/design-system/field-formats";

const STORAGE_WORD: Record<string, string> = {
  string: "Text",
  number: "Number",
  integer: "Whole number",
  boolean: "Checkbox",
  date: "Date",
  datetime: "Date & time",
  json: "Structured data",
  array: "List",
};

export function columnKindWord(field: { data_type: string; metadata?: unknown }): string {
  const format = resolveFieldFormat(field.data_type, field.metadata);
  const label = format ? getFieldFormat(format.id)?.label : undefined;
  return label || STORAGE_WORD[field.data_type] || "Text";
}
