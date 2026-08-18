"use client";

/**
 * RunHero — the top of the live run: what is being made, how far along, how
 * long it has taken, and THE PROMISE — a fixed-height row of chips naming
 * every deliverable this workflow will hand back, lit up as each one lands.
 *
 * The promise row is the "tells you what to look forward to" half (the podcast
 * ProductionTeaser's job, generalized): it is derived from the DEFINITION, so
 * it is fully populated on the very first frame — before a single node has
 * started. A person waiting on a four-minute run is then waiting FOR something
 * named, not staring into a void.
 *
 * Fixed heights throughout: the title reserves two lines and the chip row is a
 * single wrap-free scroller, so nothing below it ever moves as state changes.
 */

import { CheckCircle2, CircleDashed, Loader2 } from "lucide-react";

import { useAppSelector } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";
import IconResolver from "@/components/official/icons/IconResolver";
import { ElapsedTime } from "@/components/official-candidate/elapsed-time/ElapsedTime";

import {
  selectNodeAggregatePhases,
  selectRunCostTotal,
  selectRunStartedAt,
  selectRunStatus,
  selectRunStatusTs,
} from "../../redux/workflow-runs.selectors";
import {
  FAMILY_ICON,
  FAMILY_STYLE,
  humanizeKind,
  type RunStepPresentation,
} from "./node-presentation";

/** Run status → the one word the reader gets, plus how the surface feels. */
const STATUS_COPY: Record<
  string,
  { label: string; tone: "idle" | "live" | "good" | "bad" | "hold" }
> = {
  pending: { label: "Getting ready", tone: "idle" },
  running: { label: "Working on it", tone: "live" },
  pausing: { label: "Pausing", tone: "hold" },
  paused: { label: "Paused", tone: "hold" },
  interrupted: { label: "Waiting for you", tone: "hold" },
  cancelling: { label: "Stopping", tone: "hold" },
  cancelled: { label: "Stopped", tone: "bad" },
  completed: { label: "Done", tone: "good" },
  failed: { label: "Stopped early", tone: "bad" },
  errored: { label: "Stopped early", tone: "bad" },
};

const TONE_DOT: Record<string, string> = {
  idle: "bg-muted-foreground",
  live: "bg-primary",
  good: "bg-emerald-500",
  bad: "bg-destructive",
  hold: "bg-amber-500",
};

const TERMINAL = new Set(["completed", "failed", "cancelled", "errored"]);

function usdCopy(total: number): string | null {
  if (total <= 0) return null;
  return total < 0.01 ? "<$0.01" : `$${total.toFixed(2)}`;
}

/** One deliverable's promise chip: named from the first frame, lit on arrival. */
function PromiseChip({
  step,
  phase,
}: {
  step: RunStepPresentation;
  phase: string | undefined;
}) {
  const ready = phase === "settled";
  const working = phase === "running" || phase === "retrying";
  const style = FAMILY_STYLE[ready ? "deliver" : step.family];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors duration-500",
        ready
          ? cn(style.bg, style.ring, "font-medium text-foreground")
          : working
            ? cn(style.bg, style.ring, "text-foreground")
            : "border-border/70 text-muted-foreground",
      )}
    >
      {ready ? (
        <CheckCircle2 className={cn("h-3.5 w-3.5", style.text)} />
      ) : working ? (
        <Loader2 className={cn("h-3.5 w-3.5 animate-spin", style.text)} />
      ) : (
        <CircleDashed className="h-3.5 w-3.5 text-muted-foreground/70" />
      )}
      {step.outputKind ? humanizeKind(step.outputKind) : step.label}
    </span>
  );
}

export function RunHero({
  runId,
  workflowName,
  workflowDescription,
  steps,
  deliverables,
  /** Definition step count — the honest denominator before anything starts. */
  totalSteps,
}: {
  runId: string;
  workflowName: string;
  workflowDescription?: string | null;
  steps: RunStepPresentation[];
  deliverables: RunStepPresentation[];
  totalSteps: number;
}) {
  const status = useAppSelector(selectRunStatus(runId));
  const startedAt = useAppSelector(selectRunStartedAt(runId));
  const statusTs = useAppSelector(selectRunStatusTs(runId));
  const phases = useAppSelector(selectNodeAggregatePhases(runId));
  const costTotal = useAppSelector(selectRunCostTotal(runId));

  const copy = STATUS_COPY[status ?? "pending"] ?? STATUS_COPY.pending;
  const terminal = status !== null && TERMINAL.has(status);
  const live = !terminal;

  const done = steps.filter((step) => {
    const phase = phases[step.nodeId];
    return phase === "settled" || phase === "skipped";
  }).length;
  const denominator = Math.max(totalSteps, 1);
  const rawPct = Math.round((done / denominator) * 100);
  // Never 100% while the run can still move (the podcast law).
  const pct = terminal ? rawPct : Math.min(99, rawPct);
  const cost = usdCopy(costTotal);

  // The step doing the work right now — the one line that answers "what is it
  // doing?" without the reader hunting for it.
  const current = steps.find((step) => {
    const phase = phases[step.nodeId];
    return phase === "running" || phase === "retrying";
  });
  const headline = current
    ? current.label
    : terminal
      ? copy.label
      : (steps.find((step) => phases[step.nodeId] === undefined)?.label ??
        copy.label);

  return (
    <section className="rounded-2xl border border-border bg-card/60 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          {live && status !== "pending" ? (
            <span
              className={cn(
                "absolute inline-flex h-full w-full animate-ping rounded-full opacity-70",
                TONE_DOT[copy.tone],
              )}
            />
          ) : null}
          <span
            className={cn(
              "relative inline-flex h-2.5 w-2.5 rounded-full",
              TONE_DOT[copy.tone],
            )}
          />
        </span>
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {copy.label}
        </span>
        <div className="ml-auto flex items-center gap-3 text-xs tabular-nums text-muted-foreground">
          {cost ? <span title="AI cost so far">{cost}</span> : null}
          <span>
            {done} of {denominator} steps
          </span>
          <ElapsedTime
            startedAt={startedAt}
            running={live}
            endedAt={terminal ? statusTs : null}
            className="font-medium text-foreground"
          />
        </div>
      </div>

      {/* Two reserved lines: a 1- vs 2-line title never moves the page. */}
      <h1 className="mt-2 line-clamp-2 min-h-[2.5rem] text-xl font-semibold leading-tight text-foreground sm:text-2xl">
        {workflowName}
      </h1>
      <p className="mt-0.5 line-clamp-1 min-h-[1.25rem] text-sm text-muted-foreground">
        {live && current
          ? headline
          : (workflowDescription ?? (terminal ? "" : headline))}
      </p>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-700 ease-out",
            copy.tone === "bad"
              ? "bg-destructive"
              : copy.tone === "good"
                ? "bg-emerald-500"
                : "bg-gradient-to-r from-primary to-primary/60",
          )}
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>

      {deliverables.length > 0 ? (
        <div className="mt-3.5 flex items-center gap-2 overflow-x-auto pb-0.5">
          <span className="shrink-0 text-xs text-muted-foreground">
            {terminal ? "You got" : "You'll get"}
          </span>
          {deliverables.map((step) => (
            <PromiseChip
              key={step.nodeId}
              step={step}
              phase={phases[step.nodeId]}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

/** The small family-tinted icon chip shared by the journey and deliverables. */
export function StepIconChip({
  step,
  state,
  className,
}: {
  step: RunStepPresentation;
  state: "idle" | "running" | "done" | "failed";
  className?: string;
}) {
  const style = FAMILY_STYLE[step.family];
  return (
    <span
      className={cn(
        "relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
        state === "idle" ? "bg-muted" : style.bg,
        className,
      )}
    >
      {state === "running" ? (
        <span
          className={cn(
            "absolute inset-0 animate-spin rounded-lg border-2 border-t-transparent",
            style.ring,
          )}
        />
      ) : null}
      <IconResolver
        iconName={step.iconName ?? FAMILY_ICON[step.family]}
        fallbackIcon={FAMILY_ICON[step.family]}
        className={cn(
          "h-3.5 w-3.5",
          state === "idle" ? "text-muted-foreground" : style.text,
        )}
      />
    </span>
  );
}
