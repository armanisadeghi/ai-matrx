import type { AgentPayloadInput } from "@/components/agent-copy/buildAgentPayload";
import { rowLabelText, type RowLabelConfig } from "./row-label";
import { isRelationFormat, relationCellText, type RelationWordsByField } from "./relation-words";

export interface DataTableCopyField {
  id: string;
  field_name: string;
  display_name: string;
  /** Present on UDT fields; optional so generic callers can stay lightweight. */
  data_type?: string;
  field_order?: number;
  is_required?: boolean;
  default_value?: unknown;
  validation_rules?: unknown;
}

export interface DataTableCopyRow {
  id: string;
  data: Record<string, unknown>;
}

export type DataTableCopyScope = "view" | "selected" | "custom";

/**
 * THE ONE VALUE A COPY SEES (OLD-TABLES-CUTOVER rev 2 §3.3, reader 4).
 *
 * A `relation` column stores a record id, so a copied column, a Markdown table,
 * an export and an agent payload all put uuids on the clipboard unless the
 * words are resolved first. `relationWords` is optional so every existing
 * caller is unchanged; a table with no relation column loses nothing by
 * omitting it, and a caller that omits it on a table WITH one gets the
 * identifier marked as an identifier rather than a bare uuid.
 */
export function copyValueOf(
  row: DataTableCopyRow,
  field: DataTableCopyField,
  relationWords?: RelationWordsByField,
): unknown {
  const raw = row.data[field.field_name] ?? null;
  const format = (field as { metadata?: { format?: { id?: string } } }).metadata?.format;
  return isRelationFormat(format?.id)
    ? relationCellText(raw, relationWords?.get(field.field_name))
    : raw;
}

export function dataTableCopyValueText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function markdownValue(value: unknown): string {
  return dataTableCopyValueText(value)
    .replace(/\r?\n/g, "<br>")
    .replace(/\|/g, "\\|");
}

/** Project raw UDT rows into the friendly column labels users see. */
export function projectDataTableRows(
  rows: DataTableCopyRow[],
  fields: DataTableCopyField[],
  relationWords?: RelationWordsByField,
): Array<Record<string, unknown>> {
  return rows.map((row) =>
    Object.fromEntries(
      fields.map((field) => [field.display_name, copyValueOf(row, field, relationWords)]),
    ),
  );
}

/** Faithful, paste-ready Markdown using only the chosen rows and columns. */
export function dataTableRowsToMarkdown(
  tableName: string,
  rows: DataTableCopyRow[],
  fields: DataTableCopyField[],
  relationWords?: RelationWordsByField,
): string {
  const heading = `# ${tableName}`;
  if (fields.length === 0) return `${heading}\n\nNo columns selected.`;

  const headers = fields.map((field) =>
    field.display_name.replace(/\|/g, "\\|"),
  );
  const lines = [
    heading,
    "",
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
  ];

  for (const row of rows) {
    lines.push(
      `| ${fields
        .map((field) => markdownValue(copyValueOf(row, field, relationWords)))
        .join(" | ")} |`,
    );
  }
  return lines.join("\n");
}

export function dataTableRowLabel(
  row: DataTableCopyRow,
  fields: DataTableCopyField[],
  /** The table's row label (`row-label.ts`); when given it names the row. */
  rowLabel?: RowLabelConfig | null,
  relationWords?: RelationWordsByField,
): string {
  if (rowLabel) {
    const labelled = rowLabelText(
      row,
      fields.map((f) => ({
        field_name: f.field_name,
        display_name: f.display_name,
        data_type: f.data_type ?? "string",
        field_order: f.field_order ?? 0,
        metadata: (f as { metadata?: unknown }).metadata,
      })),
      rowLabel,
      relationWords,
    ).text;
    if (labelled) return labelled;
  }
  const values = fields
    .map((field) => dataTableCopyValueText(copyValueOf(row, field, relationWords)).trim())
    .filter(Boolean)
    .slice(0, 2);
  return values.length > 0 ? values.join(" · ") : `Row ${row.id.slice(0, 8)}`;
}

/** Canonical XML-envelope input for a copied user data table. */
export function buildDataTableAgentInput({
  tableId,
  tableName,
  rows,
  fields,
  scope,
  relationWords,
}: {
  tableId: string;
  tableName: string;
  rows: DataTableCopyRow[];
  fields: DataTableCopyField[];
  scope: DataTableCopyScope;
  relationWords?: RelationWordsByField;
}): AgentPayloadInput {
  return {
    kind: "user-data-table",
    location: "AI Matrx — Data Table",
    description: `${tableName}: ${rows.length} copied ${rows.length === 1 ? "row" : "rows"} across ${fields.length} ${fields.length === 1 ? "column" : "columns"}.`,
    data: projectDataTableRows(rows, fields, relationWords),
    summary: dataTableRowsToMarkdown(tableName, rows, fields, relationWords),
    attributes: {
      table_id: tableId,
      table_name: tableName,
      row_count: rows.length,
      column_count: fields.length,
      scope,
    },
    context: {
      instruction:
        "Treat this as the user's table data. Preserve column meanings and row relationships when analyzing or transforming it.",
    },
  };
}
