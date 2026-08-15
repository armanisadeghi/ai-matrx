import type { AgentPayloadInput } from "@/components/agent-copy/buildAgentPayload";

export interface DataTableCopyField {
  id: string;
  field_name: string;
  display_name: string;
}

export interface DataTableCopyRow {
  id: string;
  data: Record<string, unknown>;
}

export type DataTableCopyScope = "view" | "selected" | "custom";

function printableValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function markdownValue(value: unknown): string {
  return printableValue(value).replace(/\r?\n/g, "<br>").replace(/\|/g, "\\|");
}

/** Project raw UDT rows into the friendly column labels users see. */
export function projectDataTableRows(
  rows: DataTableCopyRow[],
  fields: DataTableCopyField[],
): Array<Record<string, unknown>> {
  return rows.map((row) =>
    Object.fromEntries(
      fields.map((field) => [
        field.display_name,
        row.data[field.field_name] ?? null,
      ]),
    ),
  );
}

/** Faithful, paste-ready Markdown using only the chosen rows and columns. */
export function dataTableRowsToMarkdown(
  tableName: string,
  rows: DataTableCopyRow[],
  fields: DataTableCopyField[],
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
        .map((field) => markdownValue(row.data[field.field_name]))
        .join(" | ")} |`,
    );
  }
  return lines.join("\n");
}

export function dataTableRowLabel(
  row: DataTableCopyRow,
  fields: DataTableCopyField[],
): string {
  const values = fields
    .map((field) => printableValue(row.data[field.field_name]).trim())
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
}: {
  tableId: string;
  tableName: string;
  rows: DataTableCopyRow[];
  fields: DataTableCopyField[];
  scope: DataTableCopyScope;
}): AgentPayloadInput {
  return {
    kind: "user-data-table",
    location: "AI Matrx — Data Table",
    description: `${tableName}: ${rows.length} copied ${rows.length === 1 ? "row" : "rows"} across ${fields.length} ${fields.length === 1 ? "column" : "columns"}.`,
    data: projectDataTableRows(rows, fields),
    summary: dataTableRowsToMarkdown(tableName, rows, fields),
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
