"use client";

// features/agents/browse/components/AgentBrowseRows.tsx
//
// The dense view — maximum agents per screen for someone who knows what they
// are looking for and wants to scan, not browse.
//
// One row per agent, full width, with aligned zones — star | name | category |
// tags | updated | kebab. Whole-row click opens AgentActionModal (classic
// chooser). Name is plain text so it does not navigate away.

import { Star, Archive, MoreVertical } from "lucide-react";
import { ItemMenu } from "@/components/official/item/ItemMenu";
import type { ItemMenuConfig } from "@/components/official/item/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { relativeTime } from "../columns";
import type { AgentBrowseRow } from "../types";

interface Props {
  rows: AgentBrowseRow[];
  density: "compact" | "comfortable";
  showOwner: boolean;
  menuFor: (row: AgentBrowseRow) => () => ItemMenuConfig;
  onOpenActionModal: (row: AgentBrowseRow) => void;
  onToggleFavorite: (row: AgentBrowseRow) => void;
}

export function AgentBrowseRows({
  rows,
  density,
  showOwner,
  menuFor,
  onOpenActionModal,
  onToggleFavorite,
}: Props) {
  const compact = density === "compact";

  return (
    <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
      {rows.map((row) => (
        <div
          key={row.id}
          role="button"
          tabIndex={0}
          onClick={() => onOpenActionModal(row)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onOpenActionModal(row);
            }
          }}
          className={cn(
            "group flex w-full cursor-pointer items-center gap-3 px-3 text-left transition-colors hover:bg-muted/50",
            compact ? "h-8" : "h-10",
          )}
        >
          {/* Star always occupies its slot so every name starts on the same
              x-position — an outlined star for non-favorites, not empty space. */}
          <button
            type="button"
            aria-label={
              row.is_favorite ? "Remove from favorites" : "Add to favorites"
            }
            disabled={!row.is_owner}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(row);
            }}
            className="shrink-0 rounded p-0.5 text-muted-foreground/40 hover:text-amber-500 disabled:hover:text-muted-foreground/40"
          >
            <Star
              className={cn(
                "h-3.5 w-3.5",
                row.is_favorite && "fill-amber-400 text-amber-500",
              )}
            />
          </button>

          {/* Plain text — click bubbles to the row → AgentActionModal.
              Do NOT link to Run/Build here; that steals the chooser. */}
          <span
            className={cn(
              "min-w-0 flex-1 truncate font-medium",
              compact ? "text-xs" : "text-sm",
            )}
            title={row.name}
          >
            {row.name}
          </span>

          {row.is_archived && (
            <Archive className="h-3 w-3 shrink-0 text-muted-foreground" />
          )}

          {/* Fixed-width zones from here right, so the columns line up down the
              list even though this is not a table. Each drops out on smaller
              widths rather than crushing the name. */}
          <span className="hidden w-40 shrink-0 truncate text-xs text-muted-foreground lg:block">
            {row.category ?? ""}
          </span>

          <span className="hidden w-44 shrink-0 items-center gap-1 overflow-hidden xl:flex">
            {row.tags?.slice(0, 2).map((tag) => (
              <Badge
                key={tag}
                variant="outline"
                className="max-w-[76px] shrink-0 truncate py-0 text-[10px] font-normal"
                title={tag}
              >
                {tag}
              </Badge>
            ))}
            {(row.tags?.length ?? 0) > 2 && (
              <span className="text-[10px] text-muted-foreground">
                +{(row.tags?.length ?? 0) - 2}
              </span>
            )}
          </span>

          {showOwner && (
            <span className="hidden w-48 shrink-0 truncate text-xs text-muted-foreground xl:block">
              {row.owner_email ?? ""}
            </span>
          )}

          <span
            className="hidden w-20 shrink-0 text-right text-xs tabular-nums text-muted-foreground sm:block"
            title={new Date(row.updated_at).toLocaleString()}
          >
            {relativeTime(row.updated_at)}
          </span>

          <ItemMenu config={menuFor(row)} align="end">
            <button
              type="button"
              aria-label={`Actions for ${row.name}`}
              onClick={(e) => e.stopPropagation()}
              // Reserved space, revealed on hover/focus — the row never
              // reflows when the kebab appears.
              className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </ItemMenu>
        </div>
      ))}
      {rows.length === 0 && (
        <p className="px-3 py-8 text-center text-sm text-muted-foreground">
          No agents match this scope and filter combination.
        </p>
      )}
    </div>
  );
}
