"use client";

// features/workflow-runtime/browse/components/WorkflowBrowseRows.tsx
//
// The dense view — maximum workflows per screen for someone who knows what they
// are looking for and wants to scan, not browse.
//
// One row per workflow, full width, with aligned zones: star | name | steps |
// last-run status | category | updated | kebab. Whole-row click runs it; the
// name is a real anchor so cmd-click and middle-click work.

import Link from "next/link";
import { Archive, MoreVertical, Star } from "lucide-react";
import { ItemMenu } from "@/components/official/item/ItemMenu";
import type { ItemMenuConfig } from "@/components/official/item/types";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/entity-list/columns";
import { RunStatusChip } from "../../run-status";
import type { WorkflowBrowseRow } from "../types";

interface Props {
  rows: WorkflowBrowseRow[];
  density: "compact" | "comfortable";
  showOwner: boolean;
  menuFor: (row: WorkflowBrowseRow) => () => ItemMenuConfig;
  onOpenRow: (row: WorkflowBrowseRow) => void;
  onToggleFavorite: (row: WorkflowBrowseRow) => void;
  /** THE DOOR LAW — the workflow's canonical route, from the list shell. */
  hrefFor: (row: WorkflowBrowseRow) => string | undefined;
}

export function WorkflowBrowseRows({
  rows,
  density,
  showOwner,
  menuFor,
  onOpenRow,
  onToggleFavorite,
  hrefFor,
}: Props) {
  const compact = density === "compact";

  return (
    <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
      {rows.map((row) => {
        const href = hrefFor(row);
        const nameClass = cn(
          "min-w-0 flex-1 truncate font-medium",
          compact ? "text-xs" : "text-sm",
        );
        return (
          <div
            key={row.id}
            role="button"
            tabIndex={0}
            onClick={() => onOpenRow(row)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpenRow(row);
              }
            }}
            className={cn(
              "group flex w-full cursor-pointer items-center gap-3 px-3 text-left transition-colors hover:bg-muted/50",
              compact ? "h-8" : "h-10",
            )}
          >
            {/* The star always occupies its slot so every name starts on the
                same x-position — an outlined star, not empty space. */}
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

            {href ? (
              <Link
                href={href}
                title={row.name}
                onClick={(e) => e.stopPropagation()}
                className={cn(nameClass, "hover:underline")}
              >
                {row.name}
              </Link>
            ) : (
              <span className={nameClass} title={row.name}>
                {row.name}
              </span>
            )}

            {row.is_archived && (
              <Archive className="h-3 w-3 shrink-0 text-muted-foreground" />
            )}

            {/* Fixed-width zones from here right, so the columns line up down
                the list even though this is not a table. Each drops out on
                smaller widths rather than crushing the name. */}
            <span className="hidden w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground sm:block">
              {row.step_count ?? 0} {(row.step_count ?? 0) === 1 ? "step" : "steps"}
            </span>

            <span className="hidden w-36 shrink-0 overflow-hidden lg:block">
              {row.last_run_status ? (
                row.last_run_id ? (
                  <Link
                    href={`/workflows/runs/${row.last_run_id}`}
                    onClick={(e) => e.stopPropagation()}
                    title="Open the last run"
                  >
                    <RunStatusChip status={row.last_run_status} />
                  </Link>
                ) : (
                  <RunStatusChip status={row.last_run_status} />
                )
              ) : (
                <span className="text-xs text-muted-foreground">Never run</span>
              )}
            </span>

            <span className="hidden w-36 shrink-0 truncate text-xs text-muted-foreground xl:block">
              {row.category ?? ""}
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
        );
      })}
      {rows.length === 0 && (
        <p className="px-3 py-8 text-center text-sm text-muted-foreground">
          No workflows match this scope and filter combination.
        </p>
      )}
    </div>
  );
}
