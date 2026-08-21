"use client";

/**
 * The Focus window — the ONE place on the Commission page where a step's
 * internals render at full fidelity. It auto-follows the freshest work; the
 * person can aim it at any step from the route, and one obvious action
 * ("Follow the work") returns it to following.
 *
 * This is also how the streaming budget is honoured: only the focused step is
 * promoted to a live lane (`ensureLane`, seeded with the tracked tail).
 * Everything else stays in the tracked tier and renders through the same
 * canonical `InvocationBody` when focus lands on it.
 */

import { useEffect } from "react";
import { Crosshair, LocateFixed } from "lucide-react";

import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import IconResolver from "@/components/official/icons/IconResolver";
import { ElapsedTime } from "@/components/official-candidate/elapsed-time/ElapsedTime";

import { selectNodeAggregate } from "../../redux/workflow-runs.selectors";
import {
  FAMILY_ICON,
  FAMILY_STYLE,
  familyNoun,
  humanizeKind,
  type RunStepPresentation,
} from "../../components/run/node-presentation";
import {
  InterruptCard,
  InvocationBody,
  PHASE_LABEL,
  PhaseIcon,
} from "../../components/readout-parts";
import type { UseWorkflowRunResult } from "../../hooks/useWorkflowRun";

export function FocusWindow({
  runId,
  step,
  aimed,
  onFollow,
  ensureLane,
}: {
  runId: string;
  step: RunStepPresentation;
  /** True when the person aimed the window; shows the way back to following. */
  aimed: boolean;
  onFollow: () => void;
  ensureLane: UseWorkflowRunResult["ensureLane"];
}) {
  const aggregate = useAppSelector(selectNodeAggregate(runId, step.nodeId));
  const style = FAMILY_STYLE[step.family];

  // Promote the focused step to a streaming lane — single-invocation only
  // (fan-out lanes cannot receive content until the server grows
  // per-invocation stream identity; their tracked tails still render below).
  const soleInvocation =
    aggregate.expectedCount <= 1 && aggregate.invocations.length === 1
      ? aggregate.invocations[0]
      : null;
  const wantsLane =
    soleInvocation !== null &&
    (soleInvocation.phase === "running" || soleInvocation.phase === "retrying") &&
    soleInvocation.laneRequestId === null;
  useEffect(() => {
    if (!wantsLane || !soleInvocation) return;
    ensureLane(runId, soleInvocation.invocationKey, soleInvocation.textTail);
  }, [wantsLane, soleInvocation, runId, ensureLane]);

  const running =
    aggregate.phase === "running" || aggregate.phase === "retrying";
  const startedAt = aggregate.invocations[0]?.startedAt ?? null;
  const settledMs = aggregate.invocations.reduce<number | null>(
    (max, inv) =>
      inv.durationMs !== null && (max === null || inv.durationMs > max)
        ? inv.durationMs
        : max,
    null,
  );

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      {/* Fixed-height header — nothing below moves as state changes. */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
            style.bg,
            style.text,
          )}
        >
          <IconResolver
            iconName={step.iconName ?? FAMILY_ICON[step.family]}
            className="h-4 w-4"
          />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {step.label}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {familyNoun(step.family)}
            {step.outputKind
              ? ` · makes ${humanizeKind(step.outputKind).toLowerCase()}`
              : ""}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          <PhaseIcon phase={aggregate.phase} />
          {PHASE_LABEL[aggregate.phase] ?? aggregate.phase}
          {running && startedAt ? (
            <ElapsedTime
              startedAt={startedAt}
              running
              className="tabular-nums"
            />
          ) : settledMs !== null ? (
            <span className="tabular-nums">
              {(settledMs / 1000).toFixed(settledMs < 10_000 ? 1 : 0)}s
            </span>
          ) : null}
        </span>
        {aimed ? (
          <button
            type="button"
            onClick={onFollow}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/20"
          >
            <LocateFixed className="h-3.5 w-3.5" />
            Follow the work
          </button>
        ) : (
          <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
            <Crosshair className="h-3 w-3" />
            Following
          </span>
        )}
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 scrollbar-thin">
        {/* A question from the workflow always renders here, first. */}
        <InterruptCard runId={runId} />

        {aggregate.invocations.length === 0 ? (
          <div className="space-y-2 py-6 text-center">
            <p className="text-sm text-muted-foreground">
              This step hasn&apos;t started yet.
            </p>
            {step.outputKind ? (
              <p className="text-xs text-muted-foreground">
                When it runs, it makes{" "}
                {humanizeKind(step.outputKind).toLowerCase()} — it will appear
                right here.
              </p>
            ) : null}
          </div>
        ) : (
          aggregate.invocations.map((invocation) => (
            <div key={invocation.invocationKey} className="min-w-0">
              {aggregate.invocations.length > 1 ? (
                <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                  <PhaseIcon phase={invocation.phase} />
                  Part {invocation.itemIndex + 1} of {aggregate.expectedCount}
                </p>
              ) : null}
              <InvocationBody runId={runId} invocation={invocation} />
            </div>
          ))
        )}
      </div>
    </section>
  );
}
