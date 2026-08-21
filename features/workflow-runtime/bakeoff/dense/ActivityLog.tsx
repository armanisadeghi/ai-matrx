"use client";

/**
 * ActivityLog — the truth column: the actual tools called, the engine's own
 * phases, per-step progress and durations, newest first. Sentences come from
 * the canonical `activity-copy` translator (the ONE place wire markers become
 * words); this file only lays the lines out densely.
 *
 * Newest-first means no scroll management: the latest line is always at the
 * top of the column, and history reads downward.
 */

import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Wrench,
  XCircle,
} from "lucide-react";

import { cn } from "@/lib/utils";

import { activityLine } from "../../components/run/activity-copy";
import type { RunActivityEntry } from "../../redux/workflow-runs.slice";

const TONE_ICON: Record<string, React.ReactNode> = {
  work: <CircleDashed className="h-3 w-3 text-muted-foreground" />,
  tool: <Wrench className="h-3 w-3 text-sky-600 dark:text-sky-400" />,
  done: (
    <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
  ),
  warn: (
    <AlertTriangle className="h-3 w-3 text-amber-600 dark:text-amber-400" />
  ),
  fail: <XCircle className="h-3 w-3 text-destructive" />,
};

function clock(ts: string): string {
  const parsed = Date.parse(ts);
  if (Number.isNaN(parsed)) return "";
  return new Date(parsed).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function ActivityLog({
  activity,
  stepLabels,
  quiet,
  className,
}: {
  activity: RunActivityEntry[];
  stepLabels: Record<string, string>;
  quiet: boolean;
  className?: string;
}) {
  const newestFirst = [...activity].reverse();

  return (
    <div className={cn("max-h-80 overflow-y-auto lg:max-h-none", className)}>
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border/60 bg-background px-3 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Activity
        </span>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {activity.length === 0
            ? ""
            : `${activity.length} update${activity.length === 1 ? "" : "s"}`}
        </span>
      </div>
      {quiet ? (
        <p className="border-b border-border/60 px-3 py-1.5 text-[11px] text-muted-foreground">
          Nothing new for a little while — some steps just take time.
        </p>
      ) : null}
      {newestFirst.length === 0 ? (
        <p className="px-3 py-4 text-xs text-muted-foreground">
          Nothing reported yet — the first update lands here the moment work
          starts.
        </p>
      ) : (
        <ol>
          {newestFirst.map((entry) => {
            const line = activityLine(entry, stepLabels);
            return (
              <li
                key={entry.id}
                className="flex items-start gap-1.5 border-b border-border/40 px-3 py-1.5"
              >
                <span className="mt-0.5 shrink-0">
                  {TONE_ICON[line.tone] ?? TONE_ICON.work}
                </span>
                <span className="min-w-0 flex-1 text-xs leading-snug">
                  {line.stepLabel ? (
                    <span className="font-medium text-foreground">
                      {line.stepLabel}
                      {" — "}
                    </span>
                  ) : null}
                  <span
                    className={cn(
                      line.tone === "fail"
                        ? "text-destructive"
                        : line.tone === "warn"
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-muted-foreground",
                    )}
                  >
                    {line.text}
                  </span>
                  {line.detail ? (
                    <span className="text-muted-foreground"> · {line.detail}</span>
                  ) : null}
                </span>
                <span className="shrink-0 pt-px text-[11px] tabular-nums text-muted-foreground/70">
                  {clock(entry.ts)}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
