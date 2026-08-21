"use client";

/**
 * FocusPanel — the ONE place a step's internals render at full fidelity.
 *
 * It auto-follows the freshest work; aiming it at any plan step pins it, and
 * "Back to live" resumes following. This is also how the streaming budget is
 * honored: only the focused step gets a lane promoted (SharpRunPage's
 * ensureLane effect) — everything else stays in the cheap tracked tier.
 *
 * Everything inside renders through the canonical pipeline: `InvocationBody`
 * (lane → LiveRunDisplay, settled → kind component, floor → structured view).
 * When the run is waiting on a person, the panel IS the question
 * (`InterruptCard`).
 */

import { Radio } from "lucide-react";

import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { getIconComponent } from "@/components/official/icons/IconResolver";
import {
  selectNodeAggregate,
  selectRunInterrupt,
} from "../../redux/workflow-runs.selectors";
import {
  InterruptCard,
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

export function FocusPanel({
  runId,
  step,
  stepIndex,
  stepCount,
  following,
  onFollowLive,
}: {
  runId: string;
  step: RunStepPresentation | null;
  stepIndex: number;
  stepCount: number;
  following: boolean;
  onFollowLive: () => void;
}) {
  const aggregate = useAppSelector(
    selectNodeAggregate(runId, step?.nodeId ?? "__none__"),
  );
  const interrupt = useAppSelector(selectRunInterrupt(runId));
  const interruptHere =
    interrupt !== null && step !== null && interrupt.nodeId === step.nodeId;

  const style = step ? FAMILY_STYLE[step.family] : FAMILY_STYLE.prepare;
  const Icon = getIconComponent(
    step?.iconName ?? FAMILY_ICON[step?.family ?? "prepare"],
    FAMILY_ICON[step?.family ?? "prepare"],
  );

  return (
    <section
      aria-label="Focused step"
      className="flex min-h-[22rem] flex-col rounded-xl border border-border bg-card"
    >
      <header className="flex h-12 shrink-0 items-center gap-2.5 border-b border-border px-3">
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
            style.bg,
          )}
        >
          <Icon className={cn("h-4 w-4", style.text)} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {step ? step.label : "Waiting for the plan"}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {step
              ? `${familyNoun(step.family)} · step ${stepIndex + 1} of ${stepCount}` +
                (step.outputKind ? ` · makes ${humanizeKind(step.outputKind)}` : "")
              : ""}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
          <PhaseIcon phase={aggregate.phase} />
          {PHASE_LABEL[aggregate.phase] ?? aggregate.phase}
        </span>
        {!following ? (
          <button
            type="button"
            onClick={onFollowLive}
            className="flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/15"
          >
            <Radio className="h-3 w-3" />
            Back to live
          </button>
        ) : (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">
            <Radio className="h-3 w-3 text-primary" />
            Following
          </span>
        )}
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 scrollbar-thin">
        {interruptHere ? <InterruptCard runId={runId} /> : null}
        {step === null ? null : aggregate.phase === "idle" && !interruptHere ? (
          <p className="text-xs text-muted-foreground">
            This step hasn&apos;t started yet. It will run when its turn comes
            — the plan on the left shows where the work is right now.
          </p>
        ) : (
          aggregate.invocations.map((invocation, index) => (
            <div key={invocation.invocationKey}>
              {aggregate.invocations.length > 1 ? (
                <p className="mb-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <PhaseIcon phase={invocation.phase} />
                  Part {index + 1} of {aggregate.expectedCount || aggregate.invocations.length}
                </p>
              ) : null}
              <InvocationBody runId={runId} invocation={invocation} />
            </div>
          ))
        )}
        {step !== null &&
        aggregate.phase !== "idle" &&
        aggregate.invocations.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Getting ready to start…
          </p>
        ) : null}
      </div>
    </section>
  );
}
