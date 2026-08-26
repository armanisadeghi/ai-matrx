"use client";

// features/agents/mandates/browse/MandateBrowseCards.tsx
//
// Cards view: one card per mandate — the job, what fulfils it, its input
// scale, its output shape. Same menu + row-open as the table (shared actions).

import { ArrowDownUp, Boxes, MoreHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ItemMenu } from "@/components/official/item/ItemMenu";
import { cn } from "@/lib/utils";
import type { EntityAltViewProps } from "@/lib/entity-list/config";
import { HEALTH_META, LAYER_META, type MandateListRow } from "./types";

export function MandateBrowseCards({
  rows,
  density,
  actions,
  hrefFor,
}: EntityAltViewProps<MandateListRow>) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3",
        density === "compact" && "gap-2",
      )}
    >
      {rows.map((row) => {
        const layer = LAYER_META[row.resolved_layer];
        const health = HEALTH_META[row.health];
        return (
          <article
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
              "group flex cursor-pointer flex-col rounded-xl border border-border/60 bg-card p-4 text-left transition-colors hover:border-border",
              density === "compact" && "p-3",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                {/* The name is a real anchor (Door Law) — same href the table uses. */}
                <a
                  href={hrefFor(row)}
                  onClick={(e) => e.stopPropagation()}
                  className="block truncate text-[14px] font-semibold text-foreground hover:underline"
                >
                  {row.label}
                </a>
                <div className="truncate font-mono text-[11px] text-muted-foreground/80">
                  {row.mandate_key}
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
            {row.description ? (
              <p className="mt-2 line-clamp-2 text-[12.5px] leading-relaxed text-muted-foreground">
                {row.description}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className={cn("py-0 text-[10px]", layer.className)}>
                {layer.label}
              </Badge>
              {row.resolved_agent_name ? (
                <span className="inline-flex min-w-0 items-center gap-1 text-[11.5px] text-muted-foreground">
                  <ArrowDownUp className="h-3 w-3 shrink-0" />
                  <span className="truncate">{row.resolved_agent_name}</span>
                </span>
              ) : null}
              {row.health !== "ok" ? (
                <Badge variant="outline" className={cn("py-0 text-[10px]", health.className)}>
                  {row.health === "drift" && row.drift ? row.drift : health.label}
                </Badge>
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground/80">
              {row.provision_key ? (
                <span className="inline-flex items-center gap-1">
                  <Boxes className="h-3 w-3" />
                  {row.offered_count} values offered
                </span>
              ) : (
                <span>legacy contract</span>
              )}
              {row.output_kind ? (
                <code className="truncate">→ {row.output_kind}</code>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}
