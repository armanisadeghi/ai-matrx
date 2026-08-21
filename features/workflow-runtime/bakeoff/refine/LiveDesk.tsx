"use client";

/**
 * LiveDesk — the fixed-footprint live half of the page: a spotlight on the
 * step working RIGHT NOW (its real internals, streaming through the canonical
 * pipeline) beside the play-by-play activity feed. Both panels hold a stable
 * height from the moment the run starts — state arrives INSIDE them, never
 * as page growth.
 *
 * The spotlight slot is also where the run's exceptional states live
 * (waiting-for-your-answer, paused, stopped, failed) — same box, swapped
 * content, zero shift.
 */

import { useEffect, useRef, useState } from "react";
import {
  Activity,
  CheckCircle2,
  Hammer,
  Loader2,
  OctagonX,
  PauseCircle,
  Wrench,
  AlertTriangle,
  CircleCheck,
} from "lucide-react";

import { cn } from "@/lib/utils";
import IconResolver from "@/components/official/icons/IconResolver";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";

import {
  InterruptCard,
  InvocationBody,
  PhaseIcon,
  RunErrorCard,
} from "../../components/readout-parts";
import { activityLine } from "../../components/run/activity-copy";
import {
  FAMILY_ICON,
  FAMILY_STYLE,
  familyNoun,
} from "../../components/run/node-presentation";
import type { RunActivityEntry } from "../../redux/workflow-runs.slice";
import type { WorkflowRunStatus } from "../../types";
import { useWorkflowRunControls } from "../../hooks/useWorkflowRunControls";
import { spotlightStep, type StepView } from "./plan-view";

/** How long the wire may stay silent on a live run before we say so. */
const QUIET_AFTER_MS = 25_000;

const TONE_STYLE: Record<string, string> = {
  work: "text-muted-foreground",
  tool: "text-primary",
  done: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  fail: "text-destructive",
};

function ToneIcon({ tone }: { tone: string }) {
  const cls = cn("h-3 w-3 shrink-0", TONE_STYLE[tone]);
  switch (tone) {
    case "tool":
      return <Wrench className={cls} />;
    case "done":
      return <CircleCheck className={cls} />;
    case "warn":
    case "fail":
      return <AlertTriangle className={cls} />;
    default:
      return <Hammer className={cls} />;
  }
}

/** "+0:02" — each line stamped by how far into the run it happened. Reads
 * like a match clock, never wraps, and means the same thing in every
 * timezone. Falls back to a compact clock time when the start is unknown. */
function timeOf(ts: string, startedAt: string | null): string {
  const at = Date.parse(ts);
  if (Number.isNaN(at)) return "";
  const start = startedAt ? Date.parse(startedAt) : NaN;
  if (!Number.isNaN(start)) {
    const total = Math.max(0, Math.floor((at - start) / 1000));
    const minutes = Math.floor(total / 60);
    const seconds = String(total % 60).padStart(2, "0");
    return minutes >= 60
      ? `+${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}:${seconds}`
      : `+${minutes}:${seconds}`;
  }
  return new Date(at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * The play-by-play: what actually happened, sentence by sentence, newest at
 * the bottom, auto-following unless the reader has scrolled back.
 */
function ActivityFeed({
  activity,
  stepLabels,
  quiet,
  startedAt,
}: {
  activity: RunActivityEntry[];
  stepLabels: Record<string, string>;
  quiet: boolean;
  startedAt: string | null;
}) {
  const scrollRef = useRef<HTMLOListElement | null>(null);
  const stickRef = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [activity.length, quiet]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ol
        ref={scrollRef}
        onScroll={(event) => {
          const el = event.currentTarget;
          stickRef.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        }}
        className="scrollbar-thin min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-2"
      >
        {activity.length === 0 ? (
          <li className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin text-primary" />
            Waiting for the first update…
          </li>
        ) : (
          activity.map((entry) => {
            const line = activityLine(entry, stepLabels);
            return (
              <li key={entry.id} className="flex items-baseline gap-1.5 text-xs">
                <span className="w-11 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground/70">
                  {timeOf(entry.ts, startedAt)}
                </span>
                <ToneIcon tone={line.tone} />
                <span className="min-w-0 flex-1 break-words text-foreground/90">
                  {line.stepLabel ? (
                    <span className="font-medium text-foreground">
                      {line.stepLabel}
                      {": "}
                    </span>
                  ) : null}
                  {line.text}
                  {line.detail ? (
                    <span className="text-muted-foreground"> · {line.detail}</span>
                  ) : null}
                </span>
              </li>
            );
          })
        )}
        {quiet ? (
          <li className="flex items-center gap-1.5 text-[11px] italic text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Still working — it's been quiet for a moment. Updates resume on
            their own.
          </li>
        ) : null}
      </ol>
    </div>
  );
}

/** The one step under the spotlight, rendered with its REAL internals. */
function Spotlight({
  runId,
  view,
  status,
  stepLabels,
}: {
  runId: string;
  view: StepView | null;
  status: WorkflowRunStatus | null;
  stepLabels: Record<string, string>;
}) {
  if (status === "interrupted") {
    return (
      <div className="scrollbar-thin h-full overflow-y-auto p-3">
        <InterruptCard runId={runId} />
      </div>
    );
  }
  if (status === "failed" || status === "errored") {
    return (
      <div className="scrollbar-thin h-full overflow-y-auto p-3">
        <RunErrorCard runId={runId} nodeLabels={stepLabels} />
      </div>
    );
  }
  if (status === "paused" || status === "pausing") {
    return (
      <div className="flex h-full items-center justify-center gap-2 p-3 text-sm text-muted-foreground">
        <PauseCircle className="h-4 w-4" />
        Paused — nothing is lost. Resume whenever you're ready.
      </div>
    );
  }
  if (status === "cancelled" || status === "cancelling") {
    return (
      <div className="flex h-full items-center justify-center gap-2 p-3 text-sm text-muted-foreground">
        <OctagonX className="h-4 w-4" />
        {status === "cancelling" ? "Stopping…" : "This run was stopped."}
      </div>
    );
  }
  if (status === "completed") {
    return (
      <div className="flex h-full items-center justify-center gap-2 p-3 text-sm text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        All done — everything it made is below.
      </div>
    );
  }
  if (!view) {
    return (
      <div className="flex h-full items-center justify-center gap-2 p-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        Connecting to your run…
      </div>
    );
  }

  const style = FAMILY_STYLE[view.step.family];
  // Fan-out: show the freshest invocation's body plus the count; a plain step
  // shows its one invocation.
  const invocation =
    view.invocations.find((inv) => inv.phase === "running") ??
    view.invocations[view.invocations.length - 1] ??
    null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-3 py-2">
        <span
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-md",
            style.bg,
          )}
        >
          <IconResolver
            iconName={view.step.iconName ?? FAMILY_ICON[view.step.family]}
            className={cn("h-3.5 w-3.5", style.text)}
          />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {view.step.label}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {familyNoun(view.step.family)}
            {view.expectedCount > 1
              ? ` · ${view.settledCount} of ${Math.max(view.expectedCount, view.invocations.length)} parts done`
              : ""}
          </p>
        </div>
        <PhaseIcon phase={view.phase} />
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {invocation ? (
          <InvocationBody runId={runId} invocation={invocation} />
        ) : (
          <p className="text-xs text-muted-foreground">Getting started…</p>
        )}
      </div>
    </div>
  );
}

export function LiveDesk({
  runId,
  status,
  views,
  activity,
  stepLabels,
  startedAt,
  onStartAnother,
}: {
  runId: string;
  status: WorkflowRunStatus | null;
  views: StepView[];
  activity: RunActivityEntry[];
  stepLabels: Record<string, string>;
  startedAt: string | null;
  onStartAnother: () => void;
}) {
  const { pause, resumePaused, cancel } = useWorkflowRunControls();
  const [busyVerb, setBusyVerb] = useState<string | null>(null);
  const spotlight = spotlightStep(views);

  // Quiet-wire detection: a live run with no new activity for a while says so
  // instead of looking frozen. Ticks only while the run is live.
  const live =
    status === "running" || status === "pending" || status === "pausing";
  const lastTs = activity.length > 0 ? activity[activity.length - 1].ts : null;
  // A ticking clock (interval = external system); quiet is DERIVED, so no
  // setState runs synchronously inside the effect body.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNowTick(Date.now()), 5_000);
    return () => clearInterval(id);
  }, [live]);
  const lastMs = lastTs ? Date.parse(lastTs) : NaN;
  const quiet =
    live && Number.isFinite(lastMs) && nowTick - lastMs > QUIET_AFTER_MS;

  const verb = async (name: string, action: () => Promise<boolean>) => {
    setBusyVerb(name);
    try {
      await action();
    } finally {
      setBusyVerb(null);
    }
  };

  const terminal =
    status === "completed" ||
    status === "failed" ||
    status === "errored" ||
    status === "cancelled";

  return (
    <div className="grid shrink-0 grid-cols-1 gap-3 xl:grid-cols-5">
      {/* Spotlight — fixed height, content swaps inside. */}
      <section
        aria-label="Happening now"
        className="flex h-72 flex-col overflow-hidden rounded-xl border border-border bg-card xl:col-span-3"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
          <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Activity className="h-3.5 w-3.5" />
            Happening now
          </h2>
          <div className="flex items-center gap-1.5">
            {status === "running" ? (
              <button
                type="button"
                disabled={busyVerb !== null}
                onClick={() => void verb("pause", () => pause(runId))}
                className="rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted disabled:opacity-50"
              >
                {busyVerb === "pause" ? "Pausing…" : "Pause"}
              </button>
            ) : null}
            {status === "paused" ? (
              <button
                type="button"
                disabled={busyVerb !== null}
                onClick={() => void verb("resume", () => resumePaused(runId))}
                className="rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground disabled:opacity-50"
              >
                {busyVerb === "resume" ? "Resuming…" : "Resume"}
              </button>
            ) : null}
            {!terminal && status !== null ? (
              <button
                type="button"
                disabled={busyVerb !== null}
                onClick={() =>
                  void confirm({
                    title: "Stop this run?",
                    description:
                      "It finishes the step it's on, then stops. Anything already delivered stays on this page.",
                    confirmLabel: "Stop the run",
                    variant: "destructive",
                  }).then((accepted) => {
                    if (accepted) void verb("stop", () => cancel(runId));
                  })
                }
                className="rounded-md border border-border px-2 py-1 text-[11px] font-medium text-destructive hover:bg-destructive/5 disabled:opacity-50"
              >
                {busyVerb === "stop" ? "Stopping…" : "Stop"}
              </button>
            ) : null}
            {terminal ? (
              <button
                type="button"
                onClick={onStartAnother}
                className="rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted"
              >
                Run it again
              </button>
            ) : null}
          </div>
        </header>
        <div className="min-h-0 flex-1">
          <Spotlight runId={runId} view={spotlight} status={status} stepLabels={stepLabels} />
        </div>
      </section>

      {/* Play-by-play — fixed height, own scroll. */}
      <section
        aria-label="Play-by-play"
        className="flex h-72 flex-col overflow-hidden rounded-xl border border-border bg-card xl:col-span-2"
      >
        <header className="shrink-0 border-b border-border px-3 py-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Play-by-play
          </h2>
        </header>
        <ActivityFeed activity={activity} stepLabels={stepLabels} quiet={quiet} startedAt={startedAt} />
      </section>
    </div>
  );
}
