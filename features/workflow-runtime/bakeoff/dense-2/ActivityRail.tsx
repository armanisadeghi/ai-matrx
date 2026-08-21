"use client";

/**
 * ActivityRail — the right pane: the run's truth-feed as a dense stream of
 * small updates (real tools, engine phases, per-step durations), rendered
 * through the ONE wire→sentence translator (activity-copy). Renders nothing
 * invented: when the backend said nothing, the rail says it's quiet.
 *
 * Pinned to the newest line; scrolling up unpins, one button re-pins.
 * Clicking a line aims the focus pane at its step (no dead ends).
 */

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  CheckCircle2,
  Loader2,
  Wrench,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";

import { activityLine } from "../../components/run/activity-copy";
import { selectRunActivity } from "../../redux/workflow-runs.selectors";

const TONE_ICON = {
  work: <Loader2 className="h-3 w-3 text-muted-foreground" />,
  tool: <Wrench className="h-3 w-3 text-primary" />,
  done: <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />,
  warn: <AlertTriangle className="h-3 w-3 text-amber-600 dark:text-amber-400" />,
  fail: <AlertTriangle className="h-3 w-3 text-destructive" />,
} as const;

function timeOf(ts: string): string {
  const parsed = new Date(ts);
  return Number.isNaN(parsed.getTime())
    ? ""
    : parsed.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
}

export function ActivityRail({
  runId,
  stepLabels,
  nodeIdOf,
  onAim,
}: {
  runId: string;
  /** nodeId → the author's label (a feed line never shows a graph id). */
  stepLabels: Record<string, string>;
  onAim: (nodeId: string) => void;
}) {
  const activity = useAppSelector(selectRunActivity(runId));
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [pinned, setPinned] = useState(true);

  useEffect(() => {
    if (!pinned) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [activity.length, pinned]);

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-2.5 py-1.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Activity
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {activity.length > 0 ? `${activity.length} updates` : ""}
        </span>
      </div>
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 32);
        }}
        className="min-h-0 flex-1 overflow-y-auto scrollbar-thin"
      >
        {activity.length === 0 ? (
          <p className="px-2.5 py-3 text-xs text-muted-foreground">
            Nothing reported yet. Every tool call, phase and finish lands here
            as it happens.
          </p>
        ) : (
          activity.map((entry) => {
            const line = activityLine(entry, stepLabels);
            return (
              <button
                key={entry.id}
                type="button"
                disabled={!entry.nodeId}
                onClick={() => entry.nodeId && onAim(entry.nodeId)}
                className={cn(
                  "flex w-full items-start gap-1.5 border-b border-border/40 px-2.5 py-1 text-left",
                  entry.nodeId ? "hover:bg-accent/50" : "cursor-default",
                )}
              >
                <span className="mt-0.5 shrink-0">{TONE_ICON[line.tone]}</span>
                <span className="min-w-0 flex-1">
                  {line.stepLabel ? (
                    <span className="mr-1 text-xs font-medium text-foreground">
                      {line.stepLabel}
                    </span>
                  ) : null}
                  <span className="text-xs text-muted-foreground">
                    {line.text}
                    {line.detail ? ` · ${line.detail}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/70">
                  {timeOf(entry.ts)}
                </span>
              </button>
            );
          })
        )}
      </div>
      {!pinned ? (
        <button
          type="button"
          onClick={() => {
            setPinned(true);
            const el = scrollRef.current;
            if (el) el.scrollTop = el.scrollHeight;
          }}
          className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-xs text-foreground shadow-sm"
        >
          <ArrowDown className="h-3 w-3" />
          Latest
        </button>
      ) : null}
    </div>
  );
}
