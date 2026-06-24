"use client";

import { useMemo } from "react";
import { Table2 } from "lucide-react";
import type { ToolRendererProps } from "../../types";
import { parseDataset } from "./parseDataset";
import { EntityOpenActions } from "../_shared-entity/EntityOpenActions";

const MAX_FIELD_CHIPS = 10;

/**
 * Inline renderer for `dataset` / `usertable_create` — a summary of the created
 * table (name, row count, field schema). The real row data lives in the overlay
 * (`UserTableViewer`) / the `/data/[id]` route.
 */
export function DatasetInline({ entry, onOpenWindowPanel }: ToolRendererProps) {
  const ds = useMemo(() => parseDataset(entry), [entry]);
  if (!ds.id && !ds.name) return null;

  const name = ds.name ?? "Table";
  const href = ds.id ? `/data/${ds.id}` : undefined;
  const shownFields = ds.fields.slice(0, MAX_FIELD_CHIPS);
  const moreFields = ds.fields.length - shownFields.length;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Table2 className="h-4 w-4 shrink-0 text-primary" />
        <span className="truncate text-sm font-medium text-foreground">{name}</span>
        {ds.rowCount != null ? (
          <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            {ds.rowCount.toLocaleString()} {ds.rowCount === 1 ? "row" : "rows"}
          </span>
        ) : null}
        <EntityOpenActions
          className="ml-auto"
          onOpenWindow={
            ds.id && onOpenWindowPanel ? () => onOpenWindowPanel() : undefined
          }
          href={href}
        />
      </div>

      {ds.description ? (
        <p className="text-xs text-muted-foreground">{ds.description}</p>
      ) : null}

      {shownFields.length ? (
        <div className="flex flex-wrap gap-1.5 rounded-lg border border-border bg-card px-3 py-2">
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
  );
}
