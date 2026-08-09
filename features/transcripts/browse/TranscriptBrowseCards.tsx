"use client";

// features/transcripts/browse/TranscriptBrowseCards.tsx
//
// The card view for /transcripts on the generic entity-list shell. Replaces
// TranscriptsHubCard: same kind badge + duration/updated meta, but the row's
// full ItemMenu (the ONE action list) instead of a bespoke action strip.

import Link from "next/link";
import { FileAudio, MoreHorizontal } from "lucide-react";
import { ItemMenu } from "@/components/official/item/ItemMenu";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/entity-list/columns";
import type { EntityAltViewProps } from "@/lib/entity-list/config";
import {
  formatDuration,
  KIND_META,
  type TranscriptListKind,
  type TranscriptListRow,
} from "./types";

export function TranscriptBrowseCards({
  rows,
  density,
  showShared,
  actions,
  hrefFor,
}: EntityAltViewProps<TranscriptListRow>) {
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
        const meta = KIND_META[row.kind as TranscriptListKind];
        const titleHref = hrefFor(row);
        return (
          <div
            key={row.id}
            role="button"
            tabIndex={0}
            onClick={() => actions.onOpenRow(row)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                actions.onOpenRow(row);
              }
            }}
            className="group flex cursor-pointer flex-col rounded-lg border border-border bg-card transition-colors hover:border-primary/40"
          >
            <div className="flex items-start gap-2.5 p-3">
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10",
                  meta?.accent,
                )}
              >
                <FileAudio className="h-4 w-4" />
              </span>

              <div className="min-w-0 flex-1">
                {/*
                  A real anchor on the title, so the card view is not a poorer
                  door than the table. `hrefFor` is deliberately undefined for
                  kinds with no record of their own (an unsorted Scribe capture)
                  — those stay plain text rather than linking to nowhere.
                */}
                <p className="line-clamp-2 text-sm font-medium leading-snug">
                  {titleHref ? (
                    <Link
                      href={titleHref}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {row.title}
                    </Link>
                  ) : (
                    row.title
                  )}
                </p>
                {row.description && (
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {row.description}
                  </p>
                )}
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                  <Badge
                    variant="outline"
                    className={cn(
                      "py-0 text-[10px] font-medium uppercase tracking-wide",
                      meta?.accent,
                    )}
                  >
                    {meta?.label ?? row.kind}
                  </Badge>
                  {row.is_draft && (
                    <Badge variant="outline" className="py-0 text-[10px]">
                      Draft
                    </Badge>
                  )}
                  {row.duration_seconds != null && row.duration_seconds > 0 && (
                    <span className="tabular-nums">
                      {formatDuration(row.duration_seconds)}
                    </span>
                  )}
                  <span
                    className="tabular-nums"
                    title={new Date(row.updated_at).toLocaleString()}
                  >
                    {relativeTime(row.updated_at)}
                  </span>
                  {showShared && row.owner_email && (
                    <span className="truncate">{row.owner_email}</span>
                  )}
                </div>
              </div>

              <div
                className="flex shrink-0 items-center"
                onClick={(e) => e.stopPropagation()}
              >
                <ItemMenu config={actions.menuFor(row)} align="end">
                  <button
                    type="button"
                    aria-label={`Actions for ${row.title}`}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </ItemMenu>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
