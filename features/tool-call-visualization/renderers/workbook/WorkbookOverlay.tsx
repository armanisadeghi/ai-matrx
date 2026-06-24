"use client";

import { useMemo } from "react";
import { Sheet, ExternalLink } from "lucide-react";
import type { ToolRendererProps } from "../../types";
import { parseWorkbook } from "./parseWorkbook";
import { WorkbookGrid } from "./WorkbookGrid";

/**
 * Overlay renderer for the `workbook` tool — a larger read-only preview of the
 * first sheet's real values, plus a prominent link to the full Univer editor at
 * `/workbooks/[id]` (the editor is too heavy to embed in a chat overlay).
 */
export function WorkbookOverlay({ entry }: ToolRendererProps) {
  const wb = useMemo(() => parseWorkbook(entry), [entry]);
  const name = wb.name ?? "Workbook";

  return (
    <div className="flex h-full flex-col overflow-hidden bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <Sheet className="h-4 w-4 shrink-0 text-primary" />
        <span className="truncate text-sm font-medium text-foreground">{name}</span>
        {wb.firstSheet?.name ? (
          <span className="text-xs text-muted-foreground">
            · {wb.firstSheet.name}
          </span>
        ) : null}
        {wb.id ? (
          <a
            href={`/workbooks/${wb.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
          >
            <ExternalLink className="h-4 w-4" />
            Open full editor
          </a>
        ) : null}
      </div>
      <div className="flex-1 overflow-auto p-4">
        {wb.firstSheet ? (
          <WorkbookGrid values={wb.firstSheet.values} maxRows={60} maxCols={26} />
        ) : (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No sheet data to preview.
          </div>
        )}
      </div>
    </div>
  );
}
