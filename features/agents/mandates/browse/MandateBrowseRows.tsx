"use client";

// features/agents/mandates/browse/MandateBrowseRows.tsx
//
// Compact-list view: one dense line per mandate. Same menu + row-open as the
// table and cards (shared actions object).

import { MoreHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ItemMenu } from "@/components/official/item/ItemMenu";
import { cn } from "@/lib/utils";
import type { EntityAltViewProps } from "@/lib/entity-list/config";
import { HEALTH_META, LAYER_META, type MandateListRow } from "./types";

export function MandateBrowseRows({
  rows,
  density,
  actions,
  hrefFor,
}: EntityAltViewProps<MandateListRow>) {
  return (
    <div className="divide-y divide-border/50 overflow-hidden rounded-xl border border-border/60 bg-card">
      {rows.map((row) => {
        const layer = LAYER_META[row.resolved_layer];
        const health = HEALTH_META[row.health];
        return (
          <div
            key={row.id}
            data-row-id={row.id}
            role="button"
            tabIndex={0}
            onClick={() => actions.onOpenRow(row)}
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                actions.onOpenRow(row);
              }
            }}
            className={cn(
              "flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40",
              density === "compact" && "py-1.5",
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <a
                  href={hrefFor(row)}
                  onClick={(e) => e.stopPropagation()}
                  className="truncate text-[13px] font-medium text-foreground hover:underline"
                >
                  {row.label}
                </a>
                <Badge variant="outline" className="shrink-0 py-0 text-[10px]">
                  {row.feature.replace(/_/g, " ")}
                </Badge>
                <Badge
                  variant="outline"
                  className={cn("shrink-0 py-0 text-[10px]", layer.className)}
                >
                  {layer.label}
                </Badge>
                {row.health !== "ok" ? (
                  <Badge
                    variant="outline"
                    className={cn("shrink-0 py-0 text-[10px]", health.className)}
                  >
                    {row.health === "drift" && row.drift ? row.drift : health.label}
                  </Badge>
                ) : null}
              </div>
              <div className="truncate font-mono text-[10.5px] text-muted-foreground/70">
                {row.mandate_key}
                {row.resolved_agent_name ? ` · ${row.resolved_agent_name}` : ""}
              </div>
            </div>
            <ItemMenu config={actions.menuFor(row)} align="end">
                <button
                  type="button"
                  aria-label={`Actions for ${row.label}`}
                  onClick={(e) => e.stopPropagation()}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </ItemMenu>
          </div>
        );
      })}
    </div>
  );
}
