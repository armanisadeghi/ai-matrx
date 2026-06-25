"use client";

import { useMemo } from "react";
import { Sheet, PanelRight, ExternalLink, Maximize2 } from "lucide-react";
import type { ToolRendererProps } from "../../types";
import { parseWorkbook } from "./parseWorkbook";
import { WorkbookGrid } from "./WorkbookGrid";
import { EntityCard, type EntityAction } from "../_shared-entity/EntityCard";

/**
 * Inline renderer for the `workbook` tool — a polished entity card with a small
 * preview of the first sheet's real values. The full editable spreadsheet is the
 * overlay / the `/workbooks/[id]` route via the "Open in" menu.
 */
export function WorkbookInline({
  entry,
  onOpenWindowPanel,
  onOpenOverlay,
}: ToolRendererProps) {
  const wb = useMemo(() => parseWorkbook(entry), [entry]);
  if (!wb.id && !wb.name) return null;

  const name = wb.name ?? "Workbook";
  const href = wb.id ? `/workbooks/${wb.id}` : undefined;

  const actions: EntityAction[] = [];
  if (wb.id && onOpenWindowPanel)
    actions.push({
      label: "Open in window",
      icon: PanelRight,
      onSelect: () => onOpenWindowPanel(),
    });
  if (href)
    actions.push({ label: "Open full editor", icon: ExternalLink, href });
  if (onOpenOverlay)
    actions.push({
      label: "Expand",
      icon: Maximize2,
      onSelect: () => onOpenOverlay(),
      separatorBefore: true,
    });

  const subtitle =
    wb.sheetCount > 0
      ? `${wb.sheetCount} ${wb.sheetCount === 1 ? "sheet" : "sheets"} · Workbook`
      : "Workbook";

  return (
    <EntityCard
      icon={Sheet}
      accent="green"
      title={name}
      subtitle={subtitle}
      actions={actions}
    >
      {wb.firstSheet ? (
        <div>
          {wb.firstSheet.name ? (
            <div className="border-b border-border px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
              {wb.firstSheet.name}
            </div>
          ) : null}
          <WorkbookGrid values={wb.firstSheet.values} maxRows={6} maxCols={6} />
        </div>
      ) : null}
    </EntityCard>
  );
}
