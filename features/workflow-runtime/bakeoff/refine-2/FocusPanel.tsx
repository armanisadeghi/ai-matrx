"use client";

/**
 * FocusPanel — the ONE place a step's internals render at full fidelity.
 *
 * It auto-follows the freshest work; the reader can aim it at any step from
 * the plan, and "Back to live" returns it to following. This is also how the
 * streaming budget is honored: only the focused step is promoted to a real
 * lane (`ensureLane`, single-invocation nodes only — fan-out stays tracked,
 * per the lane-manager law); everything else stays in the cheap tracked tier.
 *
 * All content renders through the canonical pipeline: `InvocationBody`
 * (LiveRunDisplay / KindInstanceRender / MarkdownStream) — never a bespoke
 * stream renderer.
 */

import { useEffect } from "react";
import { Radio } from "lucide-react";

import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { getIconComponent } from "@/components/official/icons/IconResolver";

import {
  FAMILY_ICON,
  FAMILY_STYLE,
  familyNoun,
  type RunStepPresentation,
} from "../../components/run/node-presentation";
import { InvocationBody, PHASE_LABEL, PhaseIcon } from "../../components/readout-parts";
import { selectNodeAggregate } from "../../redux/workflow-runs.selectors";

/** How many fan-out siblings render fully before we summarize the rest. */
const FAN_OUT_SHOWN = 4;

export function FocusPanel({
  runId,
  step,
  following,
  onFollowLive,
  ensureLane,
}: {
  runId: string;
  step: RunStepPresentation;
  /** True while the panel is auto-following the freshest work. */
  following: boolean;
  onFollowLive: () => void;
  ensureLane: (
    targetRunId: string,
    invocationKey: string,
    seedText?: string,
  ) => string | null;
}) {
  const aggregate = useAppSelector(selectNodeAggregate(runId, step.nodeId));
  const style = FAMILY_STYLE[step.family];
  const Icon = getIconComponent(
    step.iconName ?? FAMILY_ICON[step.family],
    FAMILY_ICON[step.family],
  );

  // Promote ONLY the focused step to a streaming lane, and only when it is a
  // single-invocation node doing work right now (the lane-manager refuses
  // fan-out lanes by law; a settled step's truth is its durable output).
  const solo =
    aggregate.invocations.length === 1 ? aggregate.invocations[0] : null;
  const wantsLane =
    solo !== null &&
    (solo.phase === "running" || solo.phase === "retrying") &&
    solo.laneRequestId === null;
  const soloKey = solo?.invocationKey ?? null;
  const soloTail = solo?.textTail ?? "";
  // Idempotent per invocation, and `wantsLane` flips false the moment the
  // lane exists — so re-runs while the tail grows are harmless no-ops.
  useEffect(() => {
    if (!wantsLane || !soloKey) return;
    ensureLane(runId, soloKey, soloTail || undefined);
  }, [wantsLane, soloKey, soloTail, runId, ensureLane]);

  const shown = aggregate.invocations.slice(0, FAN_OUT_SHOWN);
  const hiddenCount = aggregate.invocations.length - shown.length;

  return (
    <section
      aria-label="Focused step"
      className="flex min-h-[22rem] flex-col rounded-xl border border-border bg-card"
    >
      {/* Header — fixed footprint; state changes never move the body. */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
            style.bg,
            style.ring,
          )}
        >
          <Icon className={cn("h-4 w-4", style.text)} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-foreground">
            {step.label}
          </h2>
          <p className="truncate text-[11px] text-muted-foreground">
            {familyNoun(step.family)}
            {aggregate.expectedCount > 1
              ? ` · ${aggregate.settledCount} of ${aggregate.expectedCount} parts done`
              : ""}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          <PhaseIcon phase={aggregate.phase} />
          {PHASE_LABEL[aggregate.phase] ?? aggregate.phase}
        </span>
        {/* The follow control keeps a stable slot either way — zero shift. */}
        <button
          type="button"
          onClick={onFollowLive}
          disabled={following}
          className={cn(
            "flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
            following
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border text-foreground hover:bg-muted",
          )}
        >
          <Radio className="h-3.5 w-3.5" aria-hidden />
          {following ? "Following live" : "Back to live"}
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 scrollbar-thin">
        {aggregate.invocations.length === 0 ? (
          <div className="flex h-full min-h-[16rem] flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-center">
            <p className="text-sm text-muted-foreground">
              This step hasn&apos;t started yet.
            </p>
            <p className="text-xs text-muted-foreground/80">
              {step.outputKind
                ? "When it runs, its work will appear here as it happens."
                : "It will report here the moment it begins."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {shown.map((invocation) => (
              <div key={invocation.invocationKey}>
                {shown.length > 1 ? (
                  <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                    <PhaseIcon phase={invocation.phase} />
                    Part {invocation.itemIndex + 1}
                  </p>
                ) : null}
                <InvocationBody runId={runId} invocation={invocation} />
              </div>
            ))}
            {hiddenCount > 0 ? (
              <p className="text-xs text-muted-foreground">
                …and {hiddenCount} more parts, tracked in the plan.
              </p>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
