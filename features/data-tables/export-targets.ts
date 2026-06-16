/**
 * features/data-tables/export-targets.ts
 *
 * "Send this content into the data-tables system" — the canonical create-and-
 * persist helpers used by every surface that wants to push markdown or a parsed
 * table into a cloud Document or Workbook.
 *
 *   • pushMarkdownToDocument → udt_documents  (Univer preset-docs-core)
 *   • pushTableToWorkbook    → udt_workbooks  (Univer preset-sheets-core)
 *
 * Both reuse the canonical services (`document-service`, `workbook-service`) +
 * the snapshot builders in this feature. No new persistence primitive is
 * introduced. Callers get back a `PushResult` with the route to open the
 * freshly-created resource (pair with `OpenDestinationDialog` or a toast action).
 *
 * NOTE: a parallel `pushToWorkbook` exists in `features/page-extraction/
 * data-review/export-targets.ts` bound to that feature's ExportColumn/ExportRow
 * shapes. This module is the generic, content-agnostic version.
 */

"use client";

import { CellValueType } from "@univerjs/core";
import type { ICellData, IWorkbookData, IWorksheetData } from "@univerjs/core";
import { LocaleType } from "@univerjs/presets";

import {
  createWorkbook,
  saveSnapshot,
} from "@/features/data-tables/workbook-service";
import {
  createDocument,
  saveDocumentSnapshot,
} from "@/features/data-tables/document-service";
import { isServiceFailure } from "@/features/data-tables/types";
import {
  deriveDocumentName,
  markdownToUniverDoc,
} from "@/features/data-tables/markdown-to-univer-doc";

export interface PushResult {
  ok: boolean;
  /** Id of the created resource (document id / workbook id). */
  id?: string;
  /** Relative URL to open the created resource. */
  href?: string;
  error?: string;
}

// ─── Document target ─────────────────────────────────────────────────────────

/**
 * Create a cloud Document from a markdown string. The markdown is rendered to
 * Univer's rich-document model (headings, bold/italic, lists, tables, code) —
 * the document never contains literal markdown syntax.
 */
export async function pushMarkdownToDocument(
  markdown: string,
  name?: string,
): Promise<PushResult> {
  try {
    const docName = name?.trim() || deriveDocumentName(markdown);
    const created = await createDocument({
      name: docName,
      source: "imported_md",
    });
    if (isServiceFailure(created)) return { ok: false, error: created.error };

    const snapshot = markdownToUniverDoc(markdown, docName);
    const saved = await saveDocumentSnapshot({
      documentId: created.data.id,
      snapshot,
      origin: "imported",
      label: "Imported from markdown",
    });
    if (isServiceFailure(saved)) return { ok: false, error: saved.error };

    return {
      ok: true,
      id: created.data.id,
      href: `/documents/${created.data.id}`,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── Workbook target ─────────────────────────────────────────────────────────

export interface TableInput {
  /** Display name for the workbook / sheet. */
  name: string;
  /** Column headers (top row). */
  headers: string[];
  /** Body rows, each a parallel array to `headers`. */
  rows: string[][];
}

/** Strip inline markdown so a cell reads as normal spreadsheet content. */
function cleanCell(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/(?<![A-Za-z0-9])_([^_\n]+?)_(?![A-Za-z0-9])/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .trim();
}

/** Coerce a string cell to the most natural Univer cell value + type. */
function toCell(raw: string): ICellData | null {
  const value = cleanCell(raw);
  if (value === "") return null;
  // Numeric (but not values with leading zeros / non-numeric chars).
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return { v: Number(value), t: CellValueType.NUMBER };
  }
  if (value === "true" || value === "false") {
    return { v: value === "true", t: CellValueType.BOOLEAN };
  }
  return { v: value, t: CellValueType.STRING };
}

function tableToUniverSnapshot(input: TableInput): Partial<IWorkbookData> {
  const { name, headers, rows } = input;
  const cellData: NonNullable<IWorksheetData["cellData"]> = {};

  const headerRow: Record<number, ICellData> = {};
  headers.forEach((h, ci) => {
    headerRow[ci] = { v: cleanCell(h), t: CellValueType.STRING };
  });
  cellData[0] = headerRow;

  rows.forEach((row, ri) => {
    const out: Record<number, ICellData> = {};
    row.forEach((cell, ci) => {
      const c = toCell(cell);
      if (c) out[ci] = c;
    });
    if (Object.keys(out).length > 0) cellData[ri + 1] = out;
  });

  const rowCount = Math.max(rows.length + 1, 100);
  const columnCount = Math.max(headers.length, 26);
  const sheetId = `sheet-${Math.random().toString(36).slice(2, 8)}`;

  return {
    id: `wb-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Date.now()}`,
    name,
    appVersion: "1",
    locale: LocaleType.EN_US,
    styles: {},
    sheetOrder: [sheetId],
    sheets: {
      [sheetId]: {
        id: sheetId,
        name: name.slice(0, 31) || "Sheet1",
        cellData,
        rowCount,
        columnCount,
      },
    },
  };
}

/**
 * Create a Workbook (spreadsheet) from a parsed markdown table. Cells are
 * cleaned of inline markdown and typed (number / boolean / string).
 */
export async function pushTableToWorkbook(
  input: TableInput,
): Promise<PushResult> {
  try {
    const name = input.name?.trim() || "Table";
    const created = await createWorkbook({
      name,
      description: "Created from a markdown table",
      source: "created",
    });
    if (isServiceFailure(created)) return { ok: false, error: created.error };

    const snapshot = tableToUniverSnapshot({ ...input, name });
    const saved = await saveSnapshot({
      workbookId: created.data.id,
      snapshot,
      origin: "imported",
      label: name,
    });
    if (isServiceFailure(saved)) return { ok: false, error: saved.error };

    return {
      ok: true,
      id: created.data.id,
      href: `/workbooks/${created.data.id}`,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
