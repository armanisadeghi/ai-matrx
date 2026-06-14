"use client";

/**
 * features/page-extraction/data-review/ExportMenu.tsx
 *
 * The single export surface for an extraction dataset: file downloads
 * (CSV / XLSX / JSON), clipboard (table + AI-friendly markdown), and the two
 * structured push targets (Workbook, typed Dataset). All formats are built
 * from the same (columns, rows) view via ./export + ./export-targets, so what
 * you download is exactly what you copy or push.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Braces,
  ClipboardCopy,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Sparkles,
  Table2,
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
import { pushToDataset, pushToWorkbook } from "./export-targets";
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
  const router = useRouter();
  const [pushing, setPushing] = useState<"workbook" | "dataset" | null>(null);
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

  const push = async (target: "workbook" | "dataset") => {
    setPushing(target);
    try {
      const res =
        target === "workbook"
          ? await pushToWorkbook(name, columns, rows)
          : await pushToDataset(name, columns, rows);
      if (!res.ok) {
        toast.error(
          target === "workbook"
            ? "Could not create workbook"
            : "Could not create dataset",
          { description: res.error },
        );
        return;
      }
      toast.success(
        target === "workbook" ? "Workbook created" : "Dataset created",
        {
          description: res.error ?? "Click to open",
          action: res.href
            ? { label: "Open", onClick: () => router.push(res.href!) }
            : undefined,
        },
      );
    } finally {
      setPushing(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled || empty}>
          {pushing ? (
            <Loader2 className="h-4 w-4 animate-spin sm:mr-2" />
          ) : (
            <Download className="h-4 w-4 sm:mr-2" />
          )}
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

        <DropdownMenuSeparator />
        <DropdownMenuLabel>Send to</DropdownMenuLabel>
        <DropdownMenuItem
          disabled={!!pushing}
          onSelect={(e) => {
            e.preventDefault();
            void push("workbook");
          }}
        >
          <FileSpreadsheet className="mr-2 h-4 w-4" /> New workbook
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!!pushing}
          onSelect={(e) => {
            e.preventDefault();
            void push("dataset");
          }}
        >
          <Table2 className="mr-2 h-4 w-4" /> New data table
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
