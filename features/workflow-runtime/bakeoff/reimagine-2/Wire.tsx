"use client";

/**
 * The Wire — the Commission's activity column: the human clock at the top
 * (elapsed from the ENGINE's start, cost, status), then the truth-feed —
 * the actual tools called, engine phases, progress sentences and per-step
 * durations, each translated through the canonical `activity-copy` module.
 *
 * Honesty rules: it renders nothing invented — an empty feed says the engine
 * has said nothing yet; a long quiet stretch on a running run is named as a
 * quiet stretch instead of pretending liveliness.
 */

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CircleCheck,
  CircleDollarSign,
  Hammer,
  Radio,
  Timer,
  TriangleAlert,
  Wrench,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { ElapsedTime } from "@/components/official-candidate/elapsed-time/ElapsedTime";

import {
  selectRunActivity,
  selectRunCostTotal,
  selectRunStartedAt,
  selectRunStatus,
  selectRunStatusTs,
} from "../../redux/workflow-runs.selectors";
import { TERMINAL_RUN_STATUSES } from "../../types";
import { activityLine } from "../../components/run/activity-copy";
import { RunStatusChip } from "../../run-status";

const QUIET_AFTER_MS = 20_000;

function ToneIcon({ tone }: { tone: string }) {
  switch (tone) {
    case "tool":
      return <Wrench className="h-3 w-3 text-sky-600 dark:text-sky-400" />;
    case "done":
      return <CircleCheck className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />;
    case "warn":
      return <TriangleAlert className="h-3 w-3 text-amber-600 dark:text-amber-400" />;
    case "fail":
      return <AlertTriangle className="h-3 w-3 text-destructive" />;
    default:
      return <Hammer className="h-3 w-3 text-muted-foreground" />;
  }
}

export function Wire({
  runId,
  stepLabels,
}: {
  runId: string;
  stepLabels: Record<string, string>;
}) {
  const activity = useAppSelector(selectRunActivity(runId));
  const status = useAppSelector(selectRunStatus(runId));
  const startedAt = useAppSelector(selectRunStartedAt(runId));
  const statusTs = useAppSelector(selectRunStatusTs(runId));
  const cost = useAppSelector(selectRunCostTotal(runId));
  const terminal = status !== null && TERMINAL_RUN_STATUSES.has(status);
  const running = status !== null && !terminal;

  // Quiet-stretch detector: a running run with no new line for a while gets
  // an honest "still working" note rather than silence.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(id);
  }, [running]);
  const lastTs = activity.length > 0 ? Date.parse(activity[activity.length - 1].ts) : null;
  const quiet =
    running &&
    lastTs !== null &&
    !Number.isNaN(lastTs) &&
    now - lastTs > QUIET_AFTER_MS;

  // Keep the newest line in view (only when the reader is already near the
  // bottom — never yank a scrolled-up reader back down).
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const count = activity.length;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [count]);

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <header className="shrink-0 space-y-1.5 border-b border-border px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Radio className="h-3.5 w-3.5" />
            Live activity
          </span>
          <RunStatusChip status={status} />
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Timer className="h-3 w-3" />
            <ElapsedTime
              startedAt={startedAt}
              running={running}
              endedAt={terminal ? statusTs : null}
              className="tabular-nums"
            />
            {startedAt === null ? "—" : null}
          </span>
          {cost > 0 ? (
            <span className="flex items-center gap-1 tabular-nums">
              <CircleDollarSign className="h-3 w-3" />${cost.toFixed(2)}
            </span>
          ) : null}
        </div>
      </header>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-2 scrollbar-thin"
      >
        {activity.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            {running
              ? "Waiting for the first word from the engine…"
              : "The engine hasn't reported anything for this run."}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {activity.map((entry) => {
              const line = activityLine(entry, stepLabels);
              return (
                <li key={entry.id} className="flex items-start gap-2 text-xs">
                  <span className="mt-0.5 shrink-0">
                    <ToneIcon tone={line.tone} />
                  </span>
                  <span className="min-w-0">
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
                          : "text-muted-foreground",
                      )}
                    >
                      {line.text}
                    </span>
                    {line.detail ? (
                      <span className="text-muted-foreground/70">
                        {" "}
                        · {line.detail}
                      </span>
                    ) : null}
                  </span>
                </li>
              );
            })}
            {quiet ? (
              <li className="flex items-start gap-2 text-xs text-muted-foreground">
                <Hammer className="mt-0.5 h-3 w-3 shrink-0 animate-pulse" />
                <span>
                  Still working — a quiet stretch. Long steps go silent while
                  they think.
                </span>
              </li>
            ) : null}
          </ul>
        )}
      </div>
    </section>
  );
}
