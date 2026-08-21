"use client";

/**
 * WireTicker — the bottom band of the Courier concept: the real work as a
 * stream of small updates. Every line is the engine's own truth (tools
 * actually called, real phases, real durations) rendered through the ONE
 * activity-copy translation layer — nothing invented, nothing narrated.
 *
 * Fixed height; the list scrolls inside itself and follows the newest line
 * unless the reader has scrolled back to look at history.
 */

import { useEffect, useRef } from "react";
import {
  Activity,
  CheckCircle2,
  RadioTower,
  TriangleAlert,
  Wrench,
  XCircle,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { activityLine } from "@/features/workflow-runtime/components/run/activity-copy";
import {
  selectRunActivity,
  selectRunTransportMode,
} from "@/features/workflow-runtime/redux/workflow-runs.selectors";

function ToneIcon({ tone }: { tone: string }) {
  switch (tone) {
    case "tool":
      return <Wrench className="h-3 w-3 text-sky-600 dark:text-sky-400" />;
    case "done":
      return <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />;
    case "warn":
      return <TriangleAlert className="h-3 w-3 text-amber-600 dark:text-amber-400" />;
    case "fail":
      return <XCircle className="h-3 w-3 text-destructive" />;
    default:
      return <Activity className="h-3 w-3 text-muted-foreground" />;
  }
}

export function WireTicker({
  runId,
  stepLabels,
}: {
  runId: string;
  /** nodeId → the author's human label; the feed never shows a graph id. */
  stepLabels: Record<string, string>;
}) {
  const activity = useAppSelector(selectRunActivity(runId));
  const transport = useAppSelector(selectRunTransportMode(runId));
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedToEnd = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && pinnedToEnd.current) el.scrollTop = el.scrollHeight;
  }, [activity.length]);

  return (
    <section
      aria-label="Live updates"
      className="flex h-32 shrink-0 flex-col border-t border-border bg-card/40 lg:h-36"
    >
      <div className="flex shrink-0 items-center gap-1.5 px-3 pt-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        <RadioTower className="h-3 w-3" />
        Live updates
        {transport === "polling" ? (
          <span className="ml-auto normal-case tracking-normal">
            checking in every few seconds
          </span>
        ) : null}
      </div>
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          pinnedToEnd.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
        className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-3 py-1"
      >
        {activity.length === 0 ? (
          <p className="py-2 text-xs text-muted-foreground">
            Quiet so far — updates land here the moment work starts.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {activity.map((entry) => {
              const line = activityLine(entry, stepLabels);
              return (
                <li
                  key={entry.id}
                  className="flex items-baseline gap-1.5 text-[11px] leading-snug"
                >
                  <span className="relative top-px shrink-0">
                    <ToneIcon tone={line.tone} />
                  </span>
                  {line.stepLabel ? (
                    <span className="shrink-0 font-medium text-foreground/80">
                      {line.stepLabel}
                    </span>
                  ) : null}
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate",
                      line.tone === "fail"
                        ? "text-destructive"
                        : "text-muted-foreground",
                    )}
                  >
                    {line.text}
                  </span>
                  {line.detail ? (
                    <span className="shrink-0 tabular-nums text-muted-foreground/70">
                      {line.detail}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
