"use client";

// features/education/library/components/EducationLibraryCards.tsx
//
// The library's CARD view — the default a learner should meet.
//
// Why this exists: the library shipped with only the generic entity table. A
// table is the right tool for an operator auditing 500 rows; it is the wrong
// tool for a student deciding what to study next, because it renders every
// format identically and answers none of the questions they actually have
// ("how big is it, do I know it, is anything due, when did I last touch it").
// Those answers now come down with the row (`edu_library_list_scoped`), so the
// card can show them without a second fetch.
//
// The table stays — `useListViewPrefs` remembers the choice per user, and an
// older learner with 400 items still gets sorting and filtering.

import Link from "next/link";
import { BookOpen, CalendarClock, Clock, MoreHorizontal } from "lucide-react";
import { ItemMenu } from "@/components/official/item/ItemMenu";
import type { ItemMenuConfig } from "@/components/official/item/types";
import { relativeTime } from "@/lib/entity-list/columns";
import { cn } from "@/lib/utils";
import {
  artifactCount,
  artifactDuration,
  artifactTile,
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

export function EducationLibraryCards({
  rows,
  density,
  showShared,
  menuFor,
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
              "group relative flex flex-col rounded-xl border border-border bg-card transition-colors",
              visual.hoverBorder,
            )}
          >
            {/* Due badge — the single most actionable fact on the card, so it
                sits above the title where the eye lands first. */}
            {stats.dueCount > 0 && (
              <span className="absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                <CalendarClock className="h-3 w-3" />
                {stats.dueCount} due
              </span>
            )}

            <div className="flex items-start gap-3 p-3.5 pb-2.5">
              <span
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                  artifactTile(visual),
                )}
              >
                <Icon className="h-5 w-5" />
              </span>
              <div className={cn("min-w-0 flex-1", stats.dueCount > 0 && "pr-14")}>
                {/* A REAL anchor so cmd-click / middle-click / "open in new
                    tab" / keyboard focus all reach the artifact. */}
                {href ? (
                  <Link
                    href={href}
                    className="block text-sm font-semibold leading-snug text-foreground hover:underline [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden"
                    title={row.title}
                  >
                    {row.title}
                  </Link>
                ) : (
                  <span className="block text-sm font-semibold leading-snug text-foreground [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
                    {row.title}
                  </span>
                )}
                <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground">
                  <span className={cn("font-medium", visual.fg)}>
                    {visual.label}
                  </span>
                  {count && <span>· {count}</span>}
                  {duration && <span>· {duration}</span>}
                </div>
              </div>
            </div>

            {/* The material this came from — the kit's name. A learner thinks in
                "my Bio chapter", not in artifact formats, so naming the source
                is what makes eight generated artifacts feel like one thing. */}
            {(stats.sourceTitle || stats.topic) && (
              <div className="px-3.5 pb-2">
                <span className="inline-flex max-w-full items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  <BookOpen className="h-3 w-3 shrink-0" />
                  <span className="truncate">
                    {stats.sourceTitle ?? stats.topic}
                  </span>
                </span>
              </div>
            )}

            <div className="mt-auto px-3.5 pb-3">
              <StudyProgressBar
                studied={stats.studiedCount}
                total={stats.itemCount}
                accuracy={stats.accuracy}
                className="mb-2"
              />
              {/* Meta sits on its OWN line above the actions. Side by side, the
                  action button squeezed it to "Not starte…" on a narrow card. */}
              <div className="mb-1.5 min-h-4">
                <span className="block truncate text-[11px] text-muted-foreground">
                  {stats.hasProgress ? (
                    <>
                      {stats.accuracy != null && (
                        <span className="font-medium text-foreground">
                          {Math.round(stats.accuracy * 100)}% correct
                        </span>
                      )}
                      {stats.lastStudiedAt && (
                        <>
                          {stats.accuracy != null && " · "}
                          {relativeTime(stats.lastStudiedAt)}
                        </>
                      )}
                    </>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Not started
                    </span>
                  )}
                  {showShared && !row.is_owner && row.owner_email && (
                    <> · {row.owner_email}</>
                  )}
                </span>
              </div>
              <div className="flex items-center justify-end gap-1">
                {href && (
                  <Link
                    href={href}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-semibold transition-colors hover:brightness-110",
                      artifactTile(visual),
                    )}
                  >
                    {visual.verb}
                  </Link>
                )}
                <ItemMenu config={menuFor(row)} align="end">
                  <button
                    type="button"
                    aria-label={`Actions for ${row.title}`}
                    className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
