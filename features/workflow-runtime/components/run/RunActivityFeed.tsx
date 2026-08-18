"use client";

/**
 * RunActivityFeed — the REAL work, as it happens.
 *
 * The workflow twin of the podcast studio's ResearchActivityFeed, and the same
 * doctrine: the journey rail's synthetic sub-steps are the guaranteed floor
 * that always shows motion; THIS is extra truth layered on top — the actual
 * tools the agents called, the engine's own stage transitions, the progress
 * sentences ("structuring 47 chunks with the LLM"), every step starting and
 * finishing with its real duration.
 *
 * It renders NOTHING when the backend has said nothing, so a silent run
 * degrades to exactly the rail rather than an empty shell. Ordering is "as it
 * arrived" — this is a live log, not a checklist.
 */

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Loader2,
  Wrench,
} from "lucide-react";

import { useAppSelector } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";

import {
  selectRunActivity,
  selectRunStatus,
} from "../../redux/workflow-runs.selectors";
import { activityLine, type ActivityLine } from "./activity-copy";

const TERMINAL = new Set(["completed", "failed", "cancelled", "errored"]);

function ToneIcon({ tone, live }: { tone: ActivityLine["tone"]; live: boolean }) {
  switch (tone) {
    case "tool":
      return <Wrench className="h-3.5 w-3.5 shrink-0 text-sky-500" />;
    case "done":
      return (
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
      );
    case "warn":
      return <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />;
    case "fail":
      return (
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
      );
    default:
      return live ? (
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
      ) : (
        <CircleDot className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
      );
  }
}

export function RunActivityFeed({
  runId,
  /** nodeId → the author's human step name, so no id ever reaches the reader. */
  stepLabels,
  className,
}: {
  runId: string;
  stepLabels: Record<string, string>;
  className?: string;
}) {
  const activity = useAppSelector(selectRunActivity(runId));
  const status = useAppSelector(selectRunStatus(runId));
  const [open, setOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const count = activity.length;
  const streaming = status !== null && !TERMINAL.has(status);

  // Keep the newest line in view while the run is live — but only when the
  // reader is already near the bottom, so scrolling back to read something is
  // never yanked away by the next event.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element || !open) return;
    const nearBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight < 56;
    if (nearBottom) element.scrollTop = element.scrollHeight;
  }, [count, open]);

  // Nothing real to show → render nothing; the journey rail carries the UI.
  if (count === 0) return null;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-card/40",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-accent/40"
      >
        {streaming ? (
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Live activity
        </span>
        <span className="text-xs tabular-nums text-muted-foreground/80">
          {count}
        </span>
        <ChevronDown
          className={cn(
            "ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div
          ref={scrollRef}
          className="max-h-72 space-y-1 overflow-y-auto border-t border-border px-3 py-2"
        >
          {activity.map((entry, index) => {
            const line = activityLine(entry, stepLabels);
            const isNewest = index === activity.length - 1;
            return (
              <div key={entry.id} className="flex items-start gap-2 text-xs">
                <span className="mt-0.5">
                  <ToneIcon tone={line.tone} live={streaming && isNewest} />
                </span>
                <span className="min-w-0 flex-1 break-words">
                  {line.stepLabel ? (
                    <span className="text-muted-foreground/70">
                      {line.stepLabel}
                      {" · "}
                    </span>
                  ) : null}
                  <span
                    className={cn(
                      line.tone === "fail"
                        ? "text-destructive"
                        : line.tone === "warn"
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-foreground/85",
                    )}
                  >
                    {line.text}
                  </span>
                </span>
                {line.detail ? (
                  <span className="shrink-0 tabular-nums text-muted-foreground/70">
                    {line.detail}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
