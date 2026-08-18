"use client";

// features/workflow-runtime/browse/components/WorkflowBrowseCards.tsx
//
// The card view. Same shape as the agent cards (one card grammar across the
// app), carrying the facts that actually distinguish one workflow from another:
// how many steps it runs, how many times it has run, and how the last run went.
//
// Two NAMED primary actions rather than a row of unlabeled icons — icons that
// need a tooltip to be legible are not an action bar, they are a quiz. The
// complete "…" menu is the same config the table row uses.

import Link from "next/link";
import {
  Archive,
  LayoutTemplate,
  MoreHorizontal,
  Play,
  Star,
  Workflow as WorkflowIcon,
} from "lucide-react";
import { ItemMenu } from "@/components/official/item/ItemMenu";
import type { ItemMenuConfig } from "@/components/official/item/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  shouldOpenInNewTab,
  openInNewTab,
} from "@/utils/navigation/should-open-in-new-tab";
import { cleanMarkdownPreview } from "@/utils/markdown-processors/clean-markdown-to-text";
import { relativeTime } from "@/lib/entity-list/columns";
import { RunStatusChip } from "../../run-status";
import {
  workflowDesignHref,
  workflowRunHref,
} from "../workflowActionRegistry";
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

function CardAction({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof Play;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      onClick={(e) => e.stopPropagation()}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </Link>
  );
}

export function WorkflowBrowseCards({
  rows,
  density,
  showOwner,
  menuFor,
  onOpenRow,
  onToggleFavorite,
  hrefFor,
}: Props) {
  return (
    <div
      className={cn(
        "grid gap-3",
        density === "compact"
          ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5"
          : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
      )}
    >
      {rows.map((row) => {
        const href = hrefFor(row);
        const runs = Number(row.run_count ?? 0);
        return (
          <div
            key={row.id}
            role="button"
            tabIndex={0}
            onClick={(e) => {
              if (shouldOpenInNewTab(e)) {
                openInNewTab(workflowRunHref(row.id));
                return;
              }
              onOpenRow(row);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpenRow(row);
              }
            }}
            className="group flex cursor-pointer flex-col rounded-lg border border-border bg-card transition-colors hover:border-primary/40"
          >
            <div className="flex items-start gap-2.5 p-3 pb-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <WorkflowIcon className="h-4 w-4" />
              </span>

              <div className="min-w-0 flex-1">
                {/* A REAL anchor so cmd-click, middle-click, "open in new tab"
                    and keyboard focus reach the workflow; the card body still
                    handles the plain click. */}
                <p className="line-clamp-2 text-sm font-medium leading-snug">
                  {href ? (
                    <Link
                      href={href}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {row.name}
                    </Link>
                  ) : (
                    row.name
                  )}
                </p>
                {row.description && (
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {cleanMarkdownPreview(row.description)}
                  </p>
                )}
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  {row.category && (
                    <Badge
                      variant="secondary"
                      className="py-0 text-[10px] font-normal"
                    >
                      {row.category}
                    </Badge>
                  )}
                  {row.is_archived && (
                    <Badge variant="outline" className="py-0 text-[10px]">
                      <Archive className="mr-1 h-2.5 w-2.5" />
                      Archived
                    </Badge>
                  )}
                  {showOwner && row.owner_email && (
                    <span className="truncate text-[10px] text-muted-foreground">
                      {row.owner_email}
                    </span>
                  )}
                </div>
              </div>

              <div
                className="flex shrink-0 items-center gap-0.5"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  aria-label={
                    row.is_favorite
                      ? "Remove from favorites"
                      : "Add to favorites"
                  }
                  title={
                    row.is_owner
                      ? undefined
                      : "Shared workflows can't be favorited"
                  }
                  disabled={!row.is_owner}
                  onClick={() => onToggleFavorite(row)}
                  className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-40"
                >
                  <Star
                    className={cn(
                      "h-3.5 w-3.5",
                      row.is_favorite && "fill-amber-400 text-amber-500",
                    )}
                  />
                </button>
                <ItemMenu config={menuFor(row)} align="end">
                  <button
                    type="button"
                    aria-label={`Actions for ${row.name}`}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </ItemMenu>
              </div>
            </div>

            {/* The facts that tell two workflows apart. The last run is a real
                door to its permalink — the card knows the id, so printing the
                time as inert text would be a dead end. */}
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-3 pb-2 text-[11px] text-muted-foreground">
              <span className="tabular-nums">
                {row.step_count ?? 0}{" "}
                {(row.step_count ?? 0) === 1 ? "step" : "steps"}
              </span>
              <span className="tabular-nums">
                {runs > 0 ? `${runs} ${runs === 1 ? "run" : "runs"}` : "Never run"}
              </span>
              {row.last_run_at && row.last_run_id ? (
                <Link
                  href={`/workflows/runs/${row.last_run_id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 hover:text-foreground"
                  title={`Open the run from ${new Date(row.last_run_at).toLocaleString()}`}
                >
                  <RunStatusChip status={row.last_run_status} />
                  <span className="tabular-nums">
                    {relativeTime(row.last_run_at)}
                  </span>
                </Link>
              ) : null}
            </div>

            <div className="mt-auto flex items-center gap-1 border-t border-border px-2 py-1">
              <CardAction
                href={workflowRunHref(row.id)}
                icon={Play}
                label="Run it"
              />
              <CardAction
                href={workflowDesignHref(row.id)}
                icon={LayoutTemplate}
                label="Design"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
