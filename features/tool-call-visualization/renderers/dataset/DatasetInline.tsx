"use client";

import { useMemo } from "react";
import { Table2, PanelRight, ExternalLink, Maximize2 } from "lucide-react";
import type { ToolRendererProps } from "../../types";
import { parseDataset } from "./parseDataset";
import { EntityCard, type EntityAction } from "../_shared-entity/EntityCard";

const MAX_FIELD_CHIPS = 12;

/**
 * Inline renderer for `dataset` / `usertable_create` — a polished entity card
 * (name · row count · field schema chips). The real rows live in the overlay
 * (`UserTableViewer`) / the `/data/[id]` route via the "Open in" menu.
 */
export function DatasetInline({
  entry,
  onOpenWindowPanel,
  onOpenOverlay,
  expanded,
  onToggleExpanded,
}: ToolRendererProps) {
  const ds = useMemo(() => parseDataset(entry), [entry]);
  if (!ds.id && !ds.name) return null;

  const name = ds.name ?? "Table";
  const href = ds.id ? `/data/${ds.id}` : undefined;
  const shownFields = ds.fields.slice(0, MAX_FIELD_CHIPS);
  const moreFields = ds.fields.length - shownFields.length;

  const actions: EntityAction[] = [];
  if (ds.id && onOpenWindowPanel)
    actions.push({
      label: "Open in window",
      icon: PanelRight,
      onSelect: () => onOpenWindowPanel(),
    });
  if (href) actions.push({ label: "Open in new tab", icon: ExternalLink, href });
  if (ds.id && onOpenOverlay)
    actions.push({
      label: "Expand",
      icon: Maximize2,
      onSelect: () => onOpenOverlay(),
      separatorBefore: true,
    });

  const subtitle =
    ds.rowCount != null
      ? `${ds.rowCount.toLocaleString()} ${ds.rowCount === 1 ? "row" : "rows"} · Table`
      : "Table";

  return (
    <EntityCard
      expanded={expanded}
      onToggleExpanded={onToggleExpanded}
      icon={Table2}
      accent="cyan"
      title={name}
      subtitle={subtitle}
      actions={actions}
    >
      {ds.description || shownFields.length ? (
        <div className="space-y-2 px-3 py-2.5">
          {ds.description ? (
            <p className="text-xs text-muted-foreground">{ds.description}</p>
          ) : null}
          {shownFields.length ? (
            <div className="flex flex-wrap gap-1.5">
              {shownFields.map((f) => (
                <span
                  key={f.name}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[11px]"
                >
                  <span className="font-medium text-foreground">{f.name}</span>
                  {f.type ? (
                    <span className="font-mono text-muted-foreground">{f.type}</span>
                  ) : null}
                </span>
              ))}
              {moreFields > 0 ? (
                <span className="inline-flex items-center px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  +{moreFields} more
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </EntityCard>
  );
}
