"use client";

import { useMemo } from "react";
import { Sheet, PanelRight, ExternalLink, Maximize2 } from "lucide-react";
import type { ToolRendererProps } from "../../types";
import { parseWorkbook } from "./parseWorkbook";
import { isTerminal } from "../_shared";
import { WorkbookGrid } from "./WorkbookGrid";
import { EntityCard, type EntityAction } from "../_shared-entity/EntityCard";
import { EmptyResultCard } from "../_shared-entity/EmptyResultCard";

/**
 * Inline renderer for the `workbook` tool — a polished entity card with a small
 * preview of the first sheet's real values. The full editable spreadsheet is the
 * overlay / the `/workbooks/[id]` route via the "Open in" menu.
 */
export function WorkbookInline({
  entry,
  onOpenWindowPanel,
  onOpenOverlay,
  expanded,
  onToggleExpanded,
}: ToolRendererProps) {
  const wb = useMemo(() => parseWorkbook(entry), [entry]);
  if (!wb.id && !wb.name) {
    if (!isTerminal(entry)) return null;
    return (
      <EmptyResultCard
        expanded={expanded}
        onToggleExpanded={onToggleExpanded}
        icon={Sheet}
        accent="green"
        title="Workbook"
        did="Finished a workbook action"
        remedy={
          <>
            Your workbooks are all listed at{" "}
            <a
              href="/workbooks"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-foreground underline underline-offset-2"
            >
              /workbooks
            </a>
            {onOpenOverlay ? ", and the full tool result is under Expand." : "."}
          </>
        }
        actions={
          onOpenOverlay
            ? [{ label: "Expand", icon: Maximize2, onSelect: () => onOpenOverlay() }]
            : []
        }
      />
    );
  }

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
      expanded={expanded}
      onToggleExpanded={onToggleExpanded}
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
