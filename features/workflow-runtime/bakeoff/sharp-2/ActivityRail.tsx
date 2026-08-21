"use client";

/**
 * ActivityRail — the human clock. What the engine is actually doing, as a
 * stream of small plain-language updates (real tools, engine phases, per-step
 * durations), newest at the bottom, auto-scrolled while you're at the bottom.
 * Renders only what the backend actually said — no invented narration.
 */

import { useEffect, useRef } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  PackageCheck,
  Wrench,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectRunActivity } from "../../redux/workflow-runs.selectors";
import { activityLine } from "../../components/run/activity-copy";

const TONE_ICON = {
  work: CircleDot,
  tool: Wrench,
  done: CheckCircle2,
  warn: AlertTriangle,
  fail: AlertTriangle,
} as const;

const TONE_TEXT = {
  work: "text-muted-foreground",
  tool: "text-foreground",
  done: "text-primary",
  warn: "text-amber-600 dark:text-amber-400",
  fail: "text-destructive",
} as const;

const RENDER_CAP = 120;

export function ActivityRail({
  runId,
  stepLabels,
}: {
  runId: string;
  stepLabels: Record<string, string>;
}) {
  const activity = useAppSelector(selectRunActivity(runId));
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pinnedRef = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [activity.length]);

  const visible =
    activity.length > RENDER_CAP ? activity.slice(-RENDER_CAP) : activity;

  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-border bg-card">
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
        <PackageCheck className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-foreground">
          What&apos;s happening
        </span>
        {activity.length > RENDER_CAP ? (
          <span className="ml-auto text-[10px] text-muted-foreground">
            latest {RENDER_CAP}
          </span>
        ) : null}
      </header>
      <div
        ref={scrollRef}
        onScroll={(event) => {
          const el = event.currentTarget;
          pinnedRef.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-2 scrollbar-thin"
      >
        {visible.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Updates from the run appear here — the tools it uses, each step
            starting and finishing, and anything that needs your attention.
          </p>
        ) : (
          <ol className="space-y-1.5">
            {visible.map((entry) => {
              const line = activityLine(entry, stepLabels);
              const Icon = TONE_ICON[line.tone];
              return (
                <li key={entry.id} className="flex items-start gap-2">
                  <Icon
                    className={cn(
                      "mt-0.5 h-3 w-3 shrink-0",
                      TONE_TEXT[line.tone],
                    )}
                  />
                  <p className="min-w-0 text-[11px] leading-snug">
                    {line.stepLabel ? (
                      <span className="font-medium text-foreground">
                        {line.stepLabel}
                        {" — "}
                      </span>
                    ) : null}
                    <span className={TONE_TEXT[line.tone]}>{line.text}</span>
                    {line.detail ? (
                      <span className="text-muted-foreground"> · {line.detail}</span>
                    ) : null}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
