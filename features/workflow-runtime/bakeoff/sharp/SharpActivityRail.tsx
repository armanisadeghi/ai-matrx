"use client";

/**
 * SharpActivityRail — the run's truth, as a ticker of small updates.
 *
 * Renders the slice's bounded activity ring through `activityLine` — the ONE
 * canonical wire→sentence translation — newest at the bottom, auto-pinned to
 * the latest line while the reader hasn't scrolled up. Renders real facts
 * only: when the backend has said nothing, the rail says it's listening
 * rather than inventing motion.
 */

import { useEffect, useRef } from "react";
import {
  Activity,
  AlertCircle,
  Check,
  Radio,
  TriangleAlert,
  Wrench,
} from "lucide-react";

import { useAppSelector } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";

import { activityLine } from "../../components/run/activity-copy";
import {
  selectRunActivity,
  selectRunStatus,
  selectRunTransportMode,
} from "../../redux/workflow-runs.selectors";
import { TERMINAL_RUN_STATUSES } from "../../types";

const TONE_ICON = {
  work: Activity,
  tool: Wrench,
  done: Check,
  warn: TriangleAlert,
  fail: AlertCircle,
} as const;

const TONE_TEXT = {
  work: "text-muted-foreground",
  tool: "text-primary",
  done: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  fail: "text-destructive",
} as const;

function timeOf(ts: string): string {
  const parsed = Date.parse(ts);
  if (Number.isNaN(parsed)) return "";
  return new Date(parsed).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function SharpActivityRail({
  runId,
  stepLabels,
}: {
  runId: string;
  stepLabels: Record<string, string>;
}) {
  const activity = useAppSelector(selectRunActivity(runId));
  const transport = useAppSelector(selectRunTransportMode(runId));
  const status = useAppSelector(selectRunStatus(runId));
  const over = status !== null && TERMINAL_RUN_STATUSES.has(status);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pinnedRef = useRef(true);

  // Pin to the newest line unless the reader scrolled up to study history.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !pinnedRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [activity.length]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
        <span className="text-xs font-medium text-foreground">
          {over ? "What happened" : "Live updates"}
        </span>
        {/* A finished run has nothing to be connected TO — no badge. */}
        {over ? null : (
          <span
            className="flex items-center gap-1 text-[11px] text-muted-foreground"
            title={
              transport === "sse"
                ? "Connected — updates arrive the moment they happen"
                : transport === "polling"
                  ? "Checking in every few seconds"
                  : "Connecting"
            }
          >
            <Radio
              className={cn(
                "h-3 w-3",
                transport === "sse"
                  ? "text-emerald-500"
                  : "text-muted-foreground",
              )}
            />
            {transport === "sse"
              ? "live"
              : transport === "polling"
                ? "catching up"
                : "connecting"}
          </span>
        )}
      </div>
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          pinnedRef.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-3 py-2"
      >
        {activity.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Listening — updates appear here the moment work starts.
          </p>
        ) : (
          <ol className="space-y-1.5">
            {activity.map((entry) => {
              const line = activityLine(entry, stepLabels);
              const Icon = TONE_ICON[line.tone];
              return (
                <li key={entry.id} className="flex items-start gap-1.5">
                  <Icon
                    className={cn(
                      "mt-0.5 h-3 w-3 shrink-0",
                      TONE_TEXT[line.tone],
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-xs leading-snug text-foreground/90">
                      {line.stepLabel ? (
                        <span className="text-muted-foreground">
                          {line.stepLabel} ·{" "}
                        </span>
                      ) : null}
                      {line.text}
                      {line.detail ? (
                        <span className="text-muted-foreground">
                          {" "}
                          · {line.detail}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/70">
                    {timeOf(entry.ts)}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
