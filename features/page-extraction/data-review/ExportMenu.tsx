"use client";

/**
 * features/page-extraction/data-review/ExportMenu.tsx
 *
 * File/clipboard export for an extraction dataset: downloads (CSV / XLSX / JSON)
 * and clipboard (table + AI-friendly markdown). All formats are built from the
 * same (columns, rows) view via ./export, so what you download is exactly what
 * you copy. Pushing into other Matrx systems (Workbook / Data table) lives in
 * the sibling, more-discoverable <SendToMenu>.
 */

import {
  Braces,
  ClipboardCopy,
  Download,
  FileSpreadsheet,
  FileText,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  downloadBlob,
  fileSlug,
  toCSV,
  toJSON,
  toMarkdownTable,
  toTSV,
  toXLSXBlob,
  type ExportColumn,
  type ExportRow,
} from "./export";
import type { ColumnType } from "@/features/page-extraction/types";

export interface ExportMenuColumn extends ExportColumn {
  type?: ColumnType;
}

export function ExportMenu({
  name,
  columns,
  rows,
  disabled,
}: {
  name: string;
  columns: ExportMenuColumn[];
  rows: ExportRow[];
  disabled?: boolean;
}) {
  const slug = fileSlug(name);
  const empty = rows.length === 0 || columns.length === 0;

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`, {
        description: `${rows.length} row${rows.length === 1 ? "" : "s"}`,
      });
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled || empty}>
          <Download className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Export</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Download</DropdownMenuLabel>
        <DropdownMenuItem
          onClick={() =>
            downloadBlob(
              toCSV(columns, rows),
              `${slug}.csv`,
              "text/csv;charset=utf-8",
            )
          }
        >
          <FileText className="mr-2 h-4 w-4" /> CSV
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            downloadBlob(toXLSXBlob(columns, rows, name), `${slug}.xlsx`)
          }
        >
          <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            downloadBlob(
              toJSON(columns, rows),
              `${slug}.json`,
              "application/json",
            )
          }
        >
          <Braces className="mr-2 h-4 w-4" /> JSON
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuLabel>Copy</DropdownMenuLabel>
        <DropdownMenuItem
          onClick={() => void copy(toTSV(columns, rows), "Table")}
        >
          <ClipboardCopy className="mr-2 h-4 w-4" /> Copy table
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => void copy(toMarkdownTable(columns, rows), "Markdown")}
        >
          <Sparkles className="mr-2 h-4 w-4" /> Copy for AI
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
