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
): RowLabelResult {
  if (!config) return { text: "", problem: "This table has no columns to name a row by." };
  if (config.kind === "field") {
    const field = fields.find((f) => f.field_name === config.field);
    if (!field) return { text: "", problem: `The label column "${config.field}" no longer exists.` };
    const shown = formatFieldValue(
      row.data?.[field.field_name],
      resolveFieldFormat(field.data_type, field.metadata),
      field.data_type,
    );
    return { text: shown.empty ? "" : shown.text };
  }
  const parsed = parseFormula(config.expression);
  if (!parsed.ok) return { text: "", problem: parsed.error };
  const byDisplay = new Map(fields.map((f) => [f.display_name.toLowerCase(), f.field_name] as const));
  const byMachine = new Map(fields.map((f) => [f.field_name.toLowerCase(), f.field_name] as const));
  const data = row.data ?? {};
  const result = evaluateFormula(parsed.ast, (name) => {
    if (name in data) return data[name];
    const fieldName = byMachine.get(name.toLowerCase()) ?? byDisplay.get(name.toLowerCase());
    if (fieldName === undefined) return undefined;
    return data[fieldName] ?? null;
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
): string {
  const { text } = rowLabelText(row, fields, config);
  return text || `Row ${row.id.slice(0, 8)}`;
}
