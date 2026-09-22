/**
 * row-label.ts — THE value that names a row wherever the row is referred to.
 *
 * Airtable's "primary field", Notion's title. Stored on the table as
 * `metadata.row_label`, set through `udt_set_table_row_label`:
 *
 *   { kind: "field", field: "<field_name>" }           one column
 *   { kind: "formula", expression: '{First} & " " & {Last}' }  columns merged
 *
 * Every consumer that names a row — copies, references, the row-ordering
 * dialog, agents, a link from another table — calls `rowLabelText` here, so a
 * row is called the same thing everywhere. With nothing set, the label is the
 * table's first ordinary column (Airtable's rule too): honest, and never a UUID.
 */

import { evaluateFormula, parseFormula } from "./formulas";
import { formatFieldValue, resolveFieldFormat } from "@/lib/field-formats/format";
import {
  isRelationFormat,
  relationCellText,
  type RelationWordsByField,
} from "./relation-words";

export type RowLabelConfig =
  | { kind: "field"; field: string }
  | { kind: "formula"; expression: string };

export type RowLabelField = {
  field_name: string;
  display_name: string;
  data_type: string;
  field_order: number;
  metadata?: unknown;
};

/** Read `metadata.row_label`; anything malformed is `null` (= default). */
export function readRowLabel(metadata: unknown): RowLabelConfig | null {
  if (!metadata || typeof metadata !== "object") return null;
  const raw = (metadata as { row_label?: unknown }).row_label;
  if (!raw || typeof raw !== "object") return null;
  const kind = (raw as { kind?: unknown }).kind;
  if (kind === "field") {
    const field = (raw as { field?: unknown }).field;
    return typeof field === "string" && field ? { kind: "field", field } : null;
  }
  if (kind === "formula") {
    const expression = (raw as { expression?: unknown }).expression;
    return typeof expression === "string" && expression.trim()
      ? { kind: "formula", expression }
      : null;
  }
  return null;
}

function isComputedFormat(field: RowLabelField): boolean {
  const format = (field.metadata as { format?: { id?: unknown } } | null | undefined)?.format;
  const id = format?.id;
  return id === "formula" || id === "created_time" || id === "modified_time" || id === "autonumber";
}

/**
 * The default label column: the first column in table order that is not
 * computed and not a structured blob — the column people put the name in.
 */
export function defaultRowLabelField(fields: readonly RowLabelField[]): RowLabelField | null {
  const ordered = [...fields].sort((a, b) => a.field_order - b.field_order);
  return (
    ordered.find((f) => !isComputedFormat(f) && !["json", "array", "boolean"].includes(f.data_type)) ??
    ordered[0] ??
    null
  );
}

/** The effective config: what is set, else the default column. */
export function effectiveRowLabel(
  metadata: unknown,
  fields: readonly RowLabelField[],
): RowLabelConfig | null {
  const set = readRowLabel(metadata);
  if (set?.kind === "field" && !fields.some((f) => f.field_name === set.field)) {
    // The label column was deleted: fall back rather than naming rows "".
    return defaultRowLabelField(fields)
      ? { kind: "field", field: defaultRowLabelField(fields)!.field_name }
      : null;
  }
  if (set) return set;
  const fallback = defaultRowLabelField(fields);
  return fallback ? { kind: "field", field: fallback.field_name } : null;
}

/** True when this column IS the (effective) row label — drives the header marker. */
export function isRowLabelField(
  fieldName: string,
  metadata: unknown,
  fields: readonly RowLabelField[],
): boolean {
  const cfg = effectiveRowLabel(metadata, fields);
  return cfg?.kind === "field" && cfg.field === fieldName;
}

export type RowLabelResult = {
  text: string;
  /** Why `text` is empty or a stand-in, when it is. */
  problem?: string;
};

/**
 * The label of ONE row. Never throws. A field label is shown through the
 * column's own format (a date reads as a date); a formula label is the
 * formula's text result. Empty when the row has nothing there.
 */
export function rowLabelText(
  row: { data: Record<string, unknown> },
  fields: readonly RowLabelField[],
  config: RowLabelConfig | null,
  /**
   * The words each `relation` column's ids read (`relation-words.ts`). A row
   * named by a relation column is a row NAMED BY A UUID without this, on every
   * chip and every peek — which is why OLD-TABLES-CUTOVER rev 2 counts the row
   * label among the ten readers. Optional so every existing caller is unchanged;
   * a caller that omits it on a table with no relation column loses nothing.
   */
  relationWords?: RelationWordsByField,
): RowLabelResult {
  if (!config) return { text: "", problem: "This table has no columns to name a row by." };
  if (config.kind === "field") {
    const field = fields.find((f) => f.field_name === config.field);
    if (!field) return { text: "", problem: `The label column "${config.field}" no longer exists.` };
    const format = resolveFieldFormat(field.data_type, field.metadata);
    if (isRelationFormat(format?.id)) {
      // The words, or the identifier marked as one — never the bare uuid, and
      // never a blank, which would leave the row with no name at all.
      return { text: relationCellText(row.data?.[field.field_name], relationWords?.get(field.field_name)) };
    }
    const shown = formatFieldValue(row.data?.[field.field_name], format, field.data_type);
    return { text: shown.empty ? "" : shown.text };
  }
  const parsed = parseFormula(config.expression);
  if (!parsed.ok) return { text: "", problem: parsed.error };
  const byDisplay = new Map(fields.map((f) => [f.display_name.toLowerCase(), f.field_name] as const));
  const byMachine = new Map(fields.map((f) => [f.field_name.toLowerCase(), f.field_name] as const));
  const formatByName = new Map(
    fields.map((f) => [f.field_name, resolveFieldFormat(f.data_type, f.metadata)] as const),
  );
  const data = row.data ?? {};
  // THE FORMULA SEAM. `compareValues` compares whatever it is handed, and a
  // formula handed two uuids compares them as strings — `=` works by accident
  // and `<` is nonsense. It is not fixed inside the comparison: it is fixed at
  // the one place a cell BECOMES a formula value, so `=`, `<`, `&`, IF and
  // every function the language will ever gain all see the words at once.
  const read = (fieldName: string): unknown => {
    const raw = data[fieldName];
    return isRelationFormat(formatByName.get(fieldName)?.id)
      ? relationCellText(raw, relationWords?.get(fieldName))
      : raw;
  };
  const result = evaluateFormula(parsed.ast, (name) => {
    if (name in data) return read(name);
    const fieldName = byMachine.get(name.toLowerCase()) ?? byDisplay.get(name.toLowerCase());
    if (fieldName === undefined) return undefined;
    return read(fieldName) ?? null;
  });
  if (!result.ok) return { text: "", problem: result.error };
  if (result.value === null || result.value === undefined) return { text: "" };
  return { text: String(result.value).trim() };
}

/** A label, or a short honest stand-in — for lists that must show SOMETHING per row. */
export function rowLabelOrFallback(
  row: { id: string; data: Record<string, unknown> },
  fields: readonly RowLabelField[],
  config: RowLabelConfig | null,
  relationWords?: RelationWordsByField,
): string {
  const { text } = rowLabelText(row, fields, config, relationWords);
  return text || `Row ${row.id.slice(0, 8)}`;
}
