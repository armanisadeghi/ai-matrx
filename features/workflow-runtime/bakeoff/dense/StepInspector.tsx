"use client";

/**
 * StepInspector — the magnifier: ONE step at full width, its internals live.
 *
 * This is how the console spends the streaming budget: only the magnified
 * step's running invocations are promoted to lanes (`ensureLane`, seeded with
 * the tracked tail so promotion keeps the visible history). Everything else
 * stays in the tracked tier. Content renders exclusively through the
 * canonical `InvocationBody` (lane → kind component → tail → settled JSON
 * floor) — no bespoke stream rendering here or anywhere.
 */

import { useEffect } from "react";
import { Pin, PinOff } from "lucide-react";

import { useAppSelector } from "@/lib/redux/hooks";
import IconResolver from "@/components/official/icons/IconResolver";
import { cn } from "@/lib/utils";

import { selectNodeAggregate } from "../../redux/workflow-runs.selectors";
import {
  InvocationBody,
  PHASE_LABEL,
  PhaseIcon,
} from "../../components/readout-parts";
import {
  FAMILY_ICON,
  FAMILY_STYLE,
  familyNoun,
  humanizeKind,
  type RunStepPresentation,
} from "../../components/run/node-presentation";

export function StepInspector({
  runId,
  step,
  pinned,
  onUnpin,
  ensureLane,
}: {
  runId: string;
  step: RunStepPresentation;
  pinned: boolean;
  onUnpin: () => void;
  ensureLane: (
    targetRunId: string,
    invocationKey: string,
    seedText?: string,
  ) => string | null;
}) {
  const aggregate = useAppSelector(selectNodeAggregate(runId, step.nodeId));
  const style = FAMILY_STYLE[step.family];

  // The magnified step is definitionally on screen — promote its running,
  // lane-less invocations. Idempotent and budget-refusal-safe (the lane
  // manager returns the existing lane or refuses; fan-out stays tracked).
  const invocations = aggregate.invocations;
  useEffect(() => {
    for (const invocation of invocations) {
      if (invocation.phase === "running" && invocation.laneRequestId === null) {
        ensureLane(
          runId,
          invocation.invocationKey,
          invocation.textTail || undefined,
        );
      }
    }
  }, [ensureLane, invocations, runId]);

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <header className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <span
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
            style.bg,
          )}
        >
          <IconResolver
            iconName={step.iconName ?? FAMILY_ICON[step.family]}
            className={cn("h-3.5 w-3.5", style.text)}
          />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-foreground">
            {step.label}
          </div>
          <div className="truncate text-[11px] text-muted-foreground">
            {familyNoun(step.family)}
            {step.outputKind
              ? ` · produces ${humanizeKind(step.outputKind)}`
              : ""}
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
          <PhaseIcon phase={aggregate.phase} />
          {PHASE_LABEL[aggregate.phase] ?? aggregate.phase}
        </span>
        {pinned ? (
          <button
            type="button"
            onClick={onUnpin}
            title="Back to following the run"
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-border px-2 text-[11px] font-medium text-foreground hover:bg-accent"
          >
            <PinOff className="h-3 w-3" />
            Follow live
          </button>
        ) : (
          <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
            <Pin className="h-3 w-3" />
            Following
          </span>
        )}
      </header>
      <div className="min-h-[220px] space-y-3 p-3">
        {invocations.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {step.family === "input"
              ? "This is what you provided at the start."
              : "This step hasn't started yet. It will light up here the moment it does."}
          </p>
        ) : (
          invocations.map((invocation, index) => (
            <div key={invocation.invocationKey}>
              {invocations.length > 1 ? (
                <div className="mb-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <PhaseIcon phase={invocation.phase} />
                  Part {index + 1} of{" "}
                  {Math.max(aggregate.expectedCount, invocations.length)}
                </div>
              ) : null}
              <InvocationBody
                runId={runId}
                invocation={invocation}
                prefer="live"
              />
            </div>
          ))
        )}
      </div>
    </section>
  );
}
