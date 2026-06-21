/**
 * Compound / sub-dimension reference fences — entities with addressable parts
 * beyond the whole RecordRef (table schema, transcript segment, workbook sheet, …).
 *
 * Wire shapes are specified in `AIDREAM_REFERENCE_IMPLEMENTATION.md`. Frontend
 * builds fences assuming aidream resolvers exist; live chip resolution uses
 * `referenceResolvers.ts` (best-effort FE preview until BE lands).
 */

import type { ReferenceItem } from "@/features/matrx-envelope/envelope";
import { buildReferenceFence } from "@/features/matrx-envelope/referenceFence";

function fence(type: string, item: Record<string, string>): string {
  return buildReferenceFence({ type, items: [item as ReferenceItem] });
}

/** Table column definitions only — no row data. Bookmark: `table_schema`. */
export function buildTableSchemaReferenceFence(args: {
  tableId: string;
  tableName?: string;
}): string {
  const item: Record<string, string> = { table_id: args.tableId };
  const name = args.tableName?.trim();
  if (name) item.table_name = name;
  return fence("table_schema", item);
}

/** One parsed segment of a stored transcript. */
export function buildTranscriptSegmentReferenceFence(args: {
  transcriptId: string;
  segmentIndex: number;
  label?: string;
}): string {
  const item: Record<string, string> = {
    transcript_id: args.transcriptId,
    segment_index: String(args.segmentIndex),
  };
  const label = args.label?.trim();
  if (label) item.label = label;
  return fence("transcript_segment", item);
}

/** A transcript row linked to a studio session (scribe / war-room). */
export function buildSessionTranscriptReferenceFence(args: {
  sessionId: string;
  transcriptId: string;
  label?: string;
}): string {
  const item: Record<string, string> = {
    session_id: args.sessionId,
    transcript_id: args.transcriptId,
  };
  const label = args.label?.trim();
  if (label) item.label = label;
  return fence("session_transcript", item);
}

/** One sheet tab inside a Univer workbook snapshot. */
export function buildWorkbookSheetReferenceFence(args: {
  workbookId: string;
  sheetId: string;
  sheetName?: string;
  workbookName?: string;
}): string {
  const item: Record<string, string> = {
    workbook_id: args.workbookId,
    sheet_id: args.sheetId,
  };
  if (args.sheetName?.trim()) item.sheet_name = args.sheetName.trim();
  if (args.workbookName?.trim()) item.workbook_name = args.workbookName.trim();
  return fence("workbook_sheet", item);
}

/** One page of a Univer document or exported PDF (1-based page index). */
export function buildDocumentPageReferenceFence(args: {
  documentId: string;
  pageIndex: number;
  documentName?: string;
}): string {
  const item: Record<string, string> = {
    document_id: args.documentId,
    page_index: String(args.pageIndex),
  };
  if (args.documentName?.trim()) item.document_name = args.documentName.trim();
  return fence("document_page", item);
}

/** One page of a PDF file (`cld_files`). */
export function buildFilePageReferenceFence(args: {
  fileId: string;
  pageNumber: number;
  label?: string;
}): string {
  const item: Record<string, string> = {
    file_id: args.fileId,
    page_number: String(args.pageNumber),
  };
  if (args.label?.trim()) item.label = args.label.trim();
  return fence("file_page", item);
}

/** One filled context cell (scope × context item, current value). */
export function buildContextValueReferenceFence(args: {
  scopeId: string;
  contextItemId: string;
  label?: string;
}): string {
  const item: Record<string, string> = {
    scope_id: args.scopeId,
    context_item_id: args.contextItemId,
  };
  if (args.label?.trim()) item.label = args.label.trim();
  return fence("context_value", item);
}

export function transcriptSegmentIndexFromId(
  segmentId: string,
): number | undefined {
  const m = /^segment-(\d+)$/.exec(segmentId.trim());
  if (!m) return undefined;
  const n = Number.parseInt(m[1]!, 10);
  return Number.isFinite(n) ? n : undefined;
}
