"use client";

// features/education/library/components/EducationLibraryRows.tsx
//
// The library's ROW view — the middle setting between the card grid and the
// table. Same facts as the card (format, size, coverage, accuracy, what's due,
// where it came from) at roughly a third of the height, so a learner with a
// few hundred items can still scan without giving up the study signal that the
// generic table has no column for.
//
// Deliberately NOT a table: no column headers, no fixed grid. The row keeps the
// coloured format tile and the progress bar, which is what makes the list
// scannable by shape rather than by reading every title.

import Link from "next/link";
import { CalendarClock, MoreHorizontal } from "lucide-react";
import { ItemMenu } from "@/components/official/item/ItemMenu";
import type { ItemMenuConfig } from "@/components/official/item/types";
import { relativeTime } from "@/lib/entity-list/columns";
import { cn } from "@/lib/utils";
import {
  artifactCount,
  artifactDuration,
  artifactVisual,
} from "../artifactVisuals";
import { libraryRowStats, type EducationLibraryRow } from "../types";
import { StudyProgressBar } from "./StudyProgressBar";

interface Props {
  rows: EducationLibraryRow[];
  density: "compact" | "comfortable";
  showShared: boolean;
  menuFor: (row: EducationLibraryRow) => () => ItemMenuConfig;
  hrefFor: (row: EducationLibraryRow) => string | undefined;
}

export function EducationLibraryRows({
  rows,
  density,
  showShared,
  menuFor,
  hrefFor,
}: Props) {
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((row) => {
        const visual = artifactVisual(row.subtype);
        const stats = libraryRowStats(row);
        const href = hrefFor(row);
        const Icon = visual.icon;
        const count = artifactCount(row.subtype, stats.itemCount);
        const duration = artifactDuration(stats.durationSeconds);

        return (
          <div
            key={row.id}
            className={cn(
              "group flex items-center gap-3 rounded-lg border border-border bg-card px-3 transition-colors",
              visual.hoverBorder,
              density === "compact" ? "py-2" : "py-2.5",
            )}
          >
            <span
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                visual.tile,
              )}
            >
              <Icon className="h-4 w-4" />
            </span>

            <div className="min-w-0 flex-1">
              {href ? (
                <Link
                  href={href}
                  className="block truncate text-sm font-medium text-foreground hover:underline"
                  title={row.title}
                >
                  {row.title}
                </Link>
              ) : (
                <span className="block truncate text-sm font-medium text-foreground">
                  {row.title}
                </span>
              )}
              <div className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
                <span className={cn("font-medium", visual.accent)}>
                  {visual.label}
                </span>
                {count && <span>· {count}</span>}
                {duration && <span>· {duration}</span>}
                {stats.sourceTitle && (
                  <span className="truncate">· from {stats.sourceTitle}</span>
                )}
                {showShared && !row.is_owner && row.owner_email && (
                  <span className="truncate">· {row.owner_email}</span>
                )}
              </div>
            </div>

            {/* Progress column — fixed width so every row's bar starts at the
                same x and the list reads as one chart down the page. */}
            <div className="hidden w-32 shrink-0 sm:block">
              {stats.hasProgress ? (
                <>
                  <StudyProgressBar
                    studied={stats.studiedCount}
                    total={stats.itemCount}
                    accuracy={stats.accuracy}
                    className="mb-1"
                  />
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {stats.accuracy != null &&
                      `${Math.round(stats.accuracy * 100)}% correct`}
                    {stats.lastStudiedAt &&
                      `${stats.accuracy != null ? " · " : ""}${relativeTime(stats.lastStudiedAt)}`}
                  </span>
                </>
              ) : (
                <span className="block text-[11px] text-muted-foreground">
                  Not started
                </span>
              )}
            </div>

            {stats.dueCount > 0 && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                <CalendarClock className="h-3 w-3" />
                {stats.dueCount}
                <span className="max-sm:sr-only">due</span>
              </span>
            )}

            {href && (
              <Link
                href={href}
                className={cn(
                  "hidden shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors sm:inline-flex",
                  visual.tile,
                  "hover:brightness-110",
                )}
              >
                {visual.verb}
              </Link>
            )}

            <ItemMenu config={menuFor(row)} align="end">
              <button
                type="button"
                aria-label={`Actions for ${row.title}`}
                className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
