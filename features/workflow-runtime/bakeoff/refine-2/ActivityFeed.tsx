"use client";

/**
 * ActivityFeed — the run's small live updates: real tools, engine phases,
 * per-step durations, in the reader's language (activity-copy is the ONE
 * translation layer). Fixed-height, newest pinned at the bottom, scrolls
 * inside its own box — the page never shifts as lines arrive.
 */

import { useEffect, useRef } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  Wrench,
  XCircle,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";

import { activityLine } from "../../components/run/activity-copy";
import { selectRunActivity } from "../../redux/workflow-runs.selectors";

const TONE_ICON = {
  work: CircleDot,
  tool: Wrench,
  done: CheckCircle2,
  warn: AlertTriangle,
  fail: XCircle,
} as const;

const TONE_TEXT = {
  work: "text-muted-foreground",
  tool: "text-sky-600 dark:text-sky-400",
  done: "text-primary",
  warn: "text-amber-600 dark:text-amber-400",
  fail: "text-destructive",
} as const;

export function ActivityFeed({
  runId,
  stepLabels,
}: {
  runId: string;
  stepLabels: Record<string, string>;
}) {
  const activity = useAppSelector(selectRunActivity(runId));
  const scrollRef = useRef<HTMLOListElement>(null);
  const pinnedRef = useRef(true);

  // Stay pinned to the newest line unless the reader scrolled up.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [activity.length]);

  return (
    <section
      aria-label="Live activity"
      className="flex h-[16.5rem] flex-col rounded-xl border border-border bg-card"
    >
      <header className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
        <h2 className="text-xs font-semibold text-foreground">
          What&apos;s happening
        </h2>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {activity.length > 0 ? `${activity.length} updates` : ""}
        </span>
      </header>
      {activity.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-4 text-center">
          <p className="text-xs text-muted-foreground">
            Every tool call, phase and finish will be narrated here as the run
            works.
          </p>
        </div>
      ) : (
        <ol
          ref={scrollRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            pinnedRef.current =
              el.scrollHeight - el.scrollTop - el.clientHeight < 40;
          }}
          className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-2 scrollbar-thin"
        >
          {activity.map((entry) => {
            const line = activityLine(entry, stepLabels);
            const Icon = TONE_ICON[line.tone];
            return (
              <li
                key={entry.id}
                className="flex items-start gap-2 text-xs leading-snug"
              >
                <Icon
                  className={cn(
                    "mt-0.5 h-3 w-3 shrink-0",
                    TONE_TEXT[line.tone],
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  {line.stepLabel ? (
                    <span className="font-medium text-foreground">
                      {line.stepLabel}
                      {" · "}
                    </span>
                  ) : null}
                  <span className="text-muted-foreground">{line.text}</span>
                </span>
                {line.detail ? (
                  <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground/80">
                    {line.detail}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
