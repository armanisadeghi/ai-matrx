"use client";

import { useMemo } from "react";
import { Sheet } from "lucide-react";
import type { ToolRendererProps } from "../../types";
import { parseWorkbook } from "./parseWorkbook";
import { WorkbookGrid } from "./WorkbookGrid";
import { EntityOpenActions } from "../_shared-entity/EntityOpenActions";

/**
 * Inline renderer for the `workbook` tool — name + sheet count + a small preview
 * of the first sheet's real values. The full editable spreadsheet is the overlay
 * / the `/workbooks/[id]` route.
 */
export function WorkbookInline({ entry, onOpenWindowPanel }: ToolRendererProps) {
  const wb = useMemo(() => parseWorkbook(entry), [entry]);
  if (!wb.id && !wb.name) return null;

  const name = wb.name ?? "Workbook";
  const href = wb.id ? `/workbooks/${wb.id}` : undefined;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Sheet className="h-4 w-4 shrink-0 text-primary" />
        <span className="truncate text-sm font-medium text-foreground">{name}</span>
        {wb.sheetCount > 0 ? (
          <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            {wb.sheetCount} {wb.sheetCount === 1 ? "sheet" : "sheets"}
          </span>
        ) : null}
        <EntityOpenActions
          className="ml-auto"
          onOpenWindow={
            wb.id && onOpenWindowPanel ? () => onOpenWindowPanel() : undefined
          }
          href={href}
        />
      </div>

      {wb.firstSheet ? (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {wb.firstSheet.name ? (
            <div className="border-b border-border px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
              {wb.firstSheet.name}
            </div>
          ) : null}
          <WorkbookGrid values={wb.firstSheet.values} maxRows={6} maxCols={6} />
        </div>
      ) : null}
    </div>
  );
}
