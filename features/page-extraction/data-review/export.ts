/**
 * features/page-extraction/data-review/export.ts
 *
 * Pure builders that turn a (columns, rows) view of an extraction dataset into
 * every download / clipboard format. Kept free of React + DOM-write side
 * effects except the small `downloadBlob` helper, so the same builders feed the
 * grid's export menu, future bulk-export, and the push-to-workbook/udt targets.
 */

import { buildFile } from "@ai-matrx/alchemy/operate";
import { tableToCsv } from "@/components/mardown-display/tables/table-csv";
import { kindValueToMarkdown } from "@/features/canvas/export/exportArtifactMarkdown";
import { kindTextToMarkdown } from "@/features/content-ir/surfaces/kind-text-to-markdown";
import { valueCarriesKind } from "@/features/content-ir/surfaces/json-kind-signal";
import { downloadFile } from "@ai-matrx/kit/download";
import { toDelimited } from "@ai-matrx/kit/delimited";

export interface ExportColumn {
  key: string;
  label: string;
}

export type ExportRow = Record<string, unknown>;

/** Stringify a single cell value deterministically for tabular output. */
export function cellToString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * The cell as a PERSON reads it — for CSV / XLSX / TSV / markdown-table / sheet
 * destinations. A kind (a string cell that is kind JSON, a "Response" text with
 * a kind inside, or an object cell carrying `__kind`) becomes that kind's
 * markdown; everything else is exactly `cellToString`. `__kind` stays in the
 * stored data and in the explicitly raw "JSON" download (`toJSON`).
 */
export function cellToHumanString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return kindTextToMarkdown(value);
  if (typeof value === "object" && valueCarriesKind(value)) {
    const own = (value as Record<string, unknown>).__kind;
    if (!Array.isArray(value) && typeof own === "string" && own.trim()) {
      return kindValueToMarkdown(value as Record<string, unknown>);
    }
    return kindTextToMarkdown(cellToString(value));
  }
  return cellToString(value);
}

/** A 2-D array (header row + body) — the lingua franca for CSV / XLSX / Univer. */
export function toMatrix(
  columns: ExportColumn[],
  rows: ExportRow[],
): string[][] {
  const header = columns.map((c) => c.label);
  const body = rows.map((r) => columns.map((c) => cellToHumanString(r[c.key])));
  return [header, ...body];
}

export function toCSV(columns: ExportColumn[], rows: ExportRow[]): string {
  const [header, ...body] = toMatrix(columns, rows);
  // Scraped text is untrusted: tableToCsv quotes and defuses a leading = + - @ (Alchemy spreadsheetSafe).
  return tableToCsv(header, body);
}

/**
 * Tab-separated — what spreadsheets accept on paste — through THE one writer: a cell holding a
 * tab or a line break is quoted (never collapsed), and scraped text is formula-guarded.
 */
export function toTSV(columns: ExportColumn[], rows: ExportRow[]): string {
  return toDelimited(toMatrix(columns, rows), { format: "tsv" });
}

/** JSON array of objects keyed by column key (not label). */
export function toJSON(columns: ExportColumn[], rows: ExportRow[]): string {
  const keyed = rows.map((r) => {
    const out: Record<string, unknown> = {};
    for (const c of columns) out[c.key] = r[c.key] ?? null;
    return out;
  });
  return JSON.stringify(keyed, null, 2);
}

/** GitHub-flavoured markdown table — the AI-friendly tabular shape. */
export function toMarkdownTable(
  columns: ExportColumn[],
  rows: ExportRow[],
): string {
  if (columns.length === 0) return "";
  const head = `| ${columns.map((c) => c.label).join(" | ")} |`;
  const sep = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows.map(
    (r) =>
      `| ${columns
        .map((c) =>
          cellToHumanString(r[c.key]).replace(/\|/g, "\\|").replace(/\r?\n/g, " "),
        )
        .join(" | ")} |`,
  );
  return [head, sep, ...body].join("\n");
}

/** XLSX bytes built from the matrix through Alchemy's workbook format (the engine the importer reads with). */
export async function toXLSXBlob(
  columns: ExportColumn[],
  rows: ExportRow[],
  sheetName = "Extraction",
): Promise<Blob> {
  const built = await buildFile(
    {
      kind: "registered",
      format: "workbook",
      value: { sheets: [{ name: sheetName.slice(0, 31) || "Sheet1", rows: toMatrix(columns, rows) }] },
    },
    "xlsx-workbook",
  );
  return built.blob();
}

/** A safe-ish file slug from a dataset name. */
export function fileSlug(name: string): string {
  return (
    name
      .trim()
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "extraction"
  );
}

/** Trigger a browser download for a Blob or string payload. */
export function downloadBlob(
  payload: Blob | string,
  filename: string,
  mime?: string,
): void {
  const blob =
    typeof payload === "string"
      ? new Blob([payload], { type: mime ?? "text/plain;charset=utf-8" })
      : payload;
  downloadFile(filename, blob, blob.type);
  // Revoke on the next tick so the click has dispatched.
}
