"use client";

/**
 * RunJourney — every step of the workflow, from the first frame.
 *
 * The old rail could only list nodes the RUN had already reported, so a
 * four-minute run showed three grey rows and a spinner. This one is driven by
 * the DEFINITION: all N steps are on screen immediately, each with its author's
 * label, its own icon, and what it will produce — then the live phases land on
 * top of them. The wait becomes a map, not a void.
 *
 * Three layers of truth per running step, in this order:
 *   1. the step's REAL latest signal (a tool it called, an engine phase, a
 *      node_progress sentence) — pulled from the activity ring;
 *   2. the authored SYNTHETIC sub-steps (the podcast pattern) as the
 *      guaranteed floor, so motion never stops even on a silent backend;
 *   3. the phase label.
 * Layer 2 is never removed — it is the floor, not the ceiling.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, Check, SkipForward } from "lucide-react";

import { useAppSelector } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";

import {
  selectNodeAggregatePhases,
  selectRunActivity,
} from "../../redux/workflow-runs.selectors";
import type { NodeAggregatePhase } from "../../redux/workflow-runs.selectors";
import { activityLine } from "./activity-copy";
import { StepIconChip } from "./RunHero";
import {
  FAMILY_STYLE,
  familyNoun,
  humanizeKind,
  type RunStepPresentation,
} from "./node-presentation";

/** Randomized synthetic cadence — the podcast rail's proven feel. */
const SYNTH_STEP_MIN_MS = 2200;
const SYNTH_STEP_JITTER_MS = 3300;

function SyntheticSubSteps({
  labels,
  running,
}: {
  labels: string[];
  running: boolean;
}) {
  const [doneCount, setDoneCount] = useState(0);

  // Advance one sub-step on a randomized timer chain; HOLD the last until the
  // real step settles. Cleanup on unmount/phase-change ends the chain.
  useEffect(() => {
    if (!running) return undefined;
    if (doneCount >= labels.length - 1) return undefined;
    const id = setTimeout(
      () => setDoneCount((c) => c + 1),
      SYNTH_STEP_MIN_MS + Math.random() * SYNTH_STEP_JITTER_MS,
    );
    return () => clearTimeout(id);
  }, [running, doneCount, labels.length]);

  const revealed = running ? doneCount : labels.length;

  return (
    <ul className="mt-1 space-y-0.5">
      {labels.map((label, index) => {
        if (index > revealed) return null;
        const complete = index < revealed;
        return (
          <li
            key={`${index}-${label}`}
            className="flex items-center gap-1.5 text-[11px]"
          >
            <span
              className={cn(
                "h-1 w-1 shrink-0 rounded-full",
                complete ? "bg-muted-foreground/60" : "bg-primary",
                !complete && running ? "animate-pulse" : "",
              )}
            />
            <span
              className={complete ? "text-muted-foreground" : "text-foreground"}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function iconState(
  phase: NodeAggregatePhase | undefined,
): "idle" | "running" | "done" | "failed" {
  if (phase === "running" || phase === "retrying") return "running";
  if (phase === "settled") return "done";
  if (phase === "failed") return "failed";
  return "idle";
}

function JourneyRow({
  step,
  phase,
  latest,
  syntheticLabels,
  isLast,
}: {
  step: RunStepPresentation;
  phase: NodeAggregatePhase | undefined;
  /** The step's freshest REAL signal, already in the reader's language. */
  latest: string | null;
  syntheticLabels?: string[];
  isLast: boolean;
}) {
  const running = phase === "running" || phase === "retrying";
  const settled = phase === "settled";
  const failed = phase === "failed";
  const skipped = phase === "skipped";
  const started =
    phase !== undefined && phase !== "idle" && phase !== "waiting";
  const style = FAMILY_STYLE[step.family];

  return (
    <li
      data-step-id={step.nodeId}
      className="relative flex gap-2.5 pb-2.5 last:pb-0"
    >
      {/* Spine — the run reads as one continuous journey, not loose rows. */}
      {!isLast ? (
        <span
          aria-hidden
          className={cn(
            "absolute left-[13px] top-8 bottom-0 w-px",
            settled || skipped ? "bg-border" : "bg-border/50",
          )}
        />
      ) : null}

      <StepIconChip step={step} state={iconState(phase)} />

      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-baseline gap-2">
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[13px] leading-5",
              running
                ? "font-semibold text-foreground"
                : settled
                  ? "text-foreground/90"
                  : failed
                    ? "font-medium text-destructive"
                    : "text-muted-foreground",
            )}
          >
            {step.label}
          </span>
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {failed ? (
              <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
            ) : skipped ? (
              <SkipForward className="h-3.5 w-3.5" />
            ) : settled ? (
              <Check className={cn("h-3.5 w-3.5", style.text)} />
            ) : running ? (
              "now"
            ) : (
              "next"
            )}
          </span>
        </div>

        {/* Before it starts: what this step is FOR — the anticipation line. */}
        {!started ? (
          <p className="truncate text-[11px] text-muted-foreground/80">
            {step.outputKind
              ? `Will make your ${humanizeKind(step.outputKind).toLowerCase()}`
              : familyNoun(step.family)}
          </p>
        ) : null}

        {/* While it runs: the REAL signal first, the floor beneath it. Both
            retire once the step is done — a finished run should read as a
            clean checklist, and the full trace lives in the activity feed. */}
        {running ? (
          <>
            {latest ? (
              <p className="truncate text-[11px] text-foreground/80">
                {latest}
              </p>
            ) : null}
            {syntheticLabels && syntheticLabels.length > 0 ? (
              <SyntheticSubSteps labels={syntheticLabels} running />
            ) : null}
          </>
        ) : null}
      </div>
    </li>
  );
}

export function RunJourney({
  runId,
  steps,
  /** Authored synthetic sub-step labels per nodeId (from the surface config). */
  syntheticSteps,
}: {
  runId: string;
  steps: RunStepPresentation[];
  syntheticSteps?: Record<string, string[]>;
}) {
  const phases = useAppSelector(selectNodeAggregatePhases(runId));
  const activity = useAppSelector(selectRunActivity(runId));

  const stepLabels: Record<string, string> = {};
  for (const step of steps) stepLabels[step.nodeId] = step.label;

  // Freshest real signal per node — scan backwards so the newest wins, and
  // skip pure lifecycle entries (the row already shows that state).
  const latestByNode: Record<string, string> = {};
  for (let i = activity.length - 1; i >= 0; i -= 1) {
    const entry = activity[i];
    if (!entry.nodeId || latestByNode[entry.nodeId]) continue;
    if (
      entry.kind === "started" ||
      entry.kind === "completed" ||
      entry.kind === "skipped"
    ) {
      continue;
    }
    latestByNode[entry.nodeId] = activityLine(entry, stepLabels).text;
  }

  if (steps.length === 0) return null;

  return (
    <ol className="space-y-0">
      {steps.map((step, index) => (
        <JourneyRow
          key={step.nodeId}
          step={step}
          phase={phases[step.nodeId]}
          latest={latestByNode[step.nodeId] ?? null}
          syntheticLabels={syntheticSteps?.[step.nodeId]}
          isLast={index === steps.length - 1}
        />
      ))}
    </ol>
  );
}
