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
 * use it, and the canvas table artifact through StreamingTableRenderer.
 */
import { ChevronDown, Database, FileSpreadsheet, Loader2, Sheet, Table2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useOpenSaveToTable } from "@/features/overlays/openers/saveToTable";
import { useSendToWorkbook } from "./SendToWorkbookButton";
import { useSendToGoogleSheet } from "./SendToGoogleSheetButton";

/**
 * "A table…" is THE one "Save to a table" (lane SAVE-AS-TABLE-EVERYWHERE, 2026-09-29): the
 * `saveToTable` overlay — a new table with its columns' types proposed, or these rows added to a
 * table the person has, columns matched. It replaced the two writes this menu used to carry ("A
 * live table" for a chat artifact, "A data table" for everything else), each with its own dialog.
 */
export function TableSaveToMenu({
  headers,
  rows,
  title,
  resolveTitle,
  onSaved,
}: {
  headers: string[];
  rows: string[][];
  /** The name a new table is offered (the conversation, the artifact). */
  title?: string | null;
  /** Or a name worked out when the person asks (read before the screen opens). */
  resolveTitle?: () => Promise<string | null>;
  /** The rows landed in this table — a chat artifact links itself to it and becomes live. */
  onSaved?: (tableId: string, how: "new" | "existing") => void | Promise<void>;
}) {
  const workbook = useSendToWorkbook({ headers, rows });
  const sheet = useSendToGoogleSheet({ headers, rows });
  const openSaveToTable = useOpenSaveToTable();
  const [naming, setNaming] = useState(false);
  const busy = workbook.pushing || sheet.pushing || naming;
  if (!headers.length) return null;

  const saveAsTable = async () => {
    let name = title ?? null;
    if (resolveTitle) {
      setNaming(true);
      try {
        name = (await resolveTitle()) ?? name;
      } catch {
        // A name is a proposal; the screen offers the table's own heading instead.
      } finally {
        setNaming(false);
      }
    }
    openSaveToTable?.({
      grid: { headers, rows },
      title: name,
      ...(onSaved ? { onSaved: (event) => onSaved(event.tableId, event.how) } : {}),
    });
  };

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
          {openSaveToTable ? (
            <DropdownMenuItem disabled={naming} onSelect={() => void saveAsTable()} className="gap-2">
              <Table2 className="h-4 w-4" /> A table…
            </DropdownMenuItem>
          ) : null}
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
