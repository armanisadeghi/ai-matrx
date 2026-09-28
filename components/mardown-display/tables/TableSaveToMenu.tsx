"use client";

/**
 * TableSaveToMenu — ONE labelled "Save to" control for a rendered table's write
 * actions (page-pass 2026-09-27, an AI result on /p/<slug>).
 *
 * The action row under a table was eight unlabeled icons, three of them writes
 * (save as a data table, a workbook, a Google Sheet) that fail for a signed-out
 * visitor with 401 / "permission denied". The writes now live behind this one
 * labelled menu, which renders only for a viewer who can write (see
 * `useTableViewer`) — a guest keeps the actions that work for her: view, chart,
 * copy and download. Both table renderers (MarkdownTable, StreamingTableRenderer)
 * use it.
 */
import { ChevronDown, Database, ArrowUpRight, FileSpreadsheet, Loader2, Sheet, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSendToWorkbook } from "./SendToWorkbookButton";
import { useSendToGoogleSheet } from "./SendToGoogleSheetButton";

export function TableSaveToMenu({
  headers,
  rows,
  savedTableName,
  onSaveAsDataTable,
  onOpenSavedTable,
  hideDataTable = false,
  convertToTable,
}: {
  headers: string[];
  rows: string[][];
  /** Set once this table was saved as a data table — the item then opens it. */
  savedTableName?: string | null;
  onSaveAsDataTable: () => void;
  onOpenSavedTable: () => void;
  /** The surface offers its own "Convert to table" instead of a data-table save. */
  hideDataTable?: boolean;
  /**
   * A chat artifact's one-press convert: the artifact itself BECOMES a live table. It is the first
   * item of this menu, never an unlabeled icon beside it (lane HANDOVER, 2026-09-28: the one write
   * a person came for sat as a bare table icon while "Save to" offered only a workbook and a sheet).
   */
  convertToTable?: { onClick: () => void | Promise<void>; busy?: boolean; disabled?: boolean } | undefined;
}) {
  const workbook = useSendToWorkbook({ headers, rows });
  const sheet = useSendToGoogleSheet({ headers, rows });
  const busy = workbook.pushing || sheet.pushing || Boolean(convertToTable?.busy);
  if (!headers.length) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            data-keep-label=""
            aria-label="Save this table to…"
            className="h-7 gap-1 px-2 text-xs"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Database className="h-3.5 w-3.5" aria-hidden />
            )}
            Save to
            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {convertToTable ? (
            <DropdownMenuItem
              disabled={Boolean(convertToTable.disabled || convertToTable.busy)}
              onSelect={() => void convertToTable.onClick()}
              className="gap-2"
            >
              <Table2 className="h-4 w-4" /> {convertToTable.busy ? "Making the table…" : "A live table"}
            </DropdownMenuItem>
          ) : null}
          {hideDataTable || convertToTable ? null : savedTableName ? (
            <DropdownMenuItem onSelect={onOpenSavedTable} className="gap-2">
              <ArrowUpRight className="h-4 w-4" /> Open “{savedTableName}”
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={onSaveAsDataTable} className="gap-2">
              <Database className="h-4 w-4" /> A data table
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            disabled={workbook.pushing}
            onSelect={() => void workbook.send()}
            className="gap-2"
          >
            <FileSpreadsheet className="h-4 w-4" /> A workbook
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={sheet.pushing}
            onSelect={() => void sheet.send()}
            className="gap-2"
          >
            <Sheet className="h-4 w-4" /> A Google Sheet
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {workbook.dialog}
    </>
  );
}
