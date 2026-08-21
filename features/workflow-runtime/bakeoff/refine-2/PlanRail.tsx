"use client";

/**
 * PlanRail — the left column: every step of the definition, present from
 * frame zero, with finished stretches folding into compact "n steps done"
 * rows (plan-model.ts). Clicking a step aims the focus panel at it.
 */

import { useState } from "react";
import { Check, ChevronDown, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { getIconComponent } from "@/components/official/icons/IconResolver";

import {
  FAMILY_ICON,
  FAMILY_STYLE,
  type RunStepPresentation,
} from "../../components/run/node-presentation";
import { PHASE_LABEL, PhaseIcon } from "../../components/readout-parts";
import type { NodeAggregatePhase } from "../../redux/workflow-runs.selectors";
import { condensePlan, type PlanStepRow } from "./plan-model";

function StepIcon({
  step,
  className,
}: {
  step: RunStepPresentation;
  className?: string;
}) {
  const Icon = getIconComponent(
    step.iconName ?? FAMILY_ICON[step.family],
    FAMILY_ICON[step.family],
  );
  return <Icon className={className} aria-hidden />;
}

function StepRow({
  row,
  focused,
  onAim,
}: {
  row: PlanStepRow;
  focused: boolean;
  onAim: (nodeId: string) => void;
}) {
  const { step, phase } = row;
  const style = FAMILY_STYLE[step.family];
  const active = phase === "running" || phase === "retrying";
  return (
    <button
      type="button"
      onClick={() => onAim(step.nodeId)}
      aria-current={focused ? "step" : undefined}
      className={cn(
        "group flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors",
        focused
          ? "border-primary/50 bg-primary/5"
          : "border-transparent hover:bg-muted/60",
      )}
    >
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border",
          style.bg,
          style.ring,
          phase === "idle" && "opacity-50",
        )}
      >
        <StepIcon step={step} className={cn("h-3.5 w-3.5", style.text)} />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-sm",
            phase === "idle" ? "text-muted-foreground" : "text-foreground",
            active && "font-medium",
          )}
        >
          {step.label}
        </span>
        <span className="block truncate text-[11px] text-muted-foreground">
          Step {row.position}
          {step.outputKind ? " · produces something you keep" : ""}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
        <PhaseIcon phase={phase} />
        <span className="hidden sm:inline">{PHASE_LABEL[phase] ?? ""}</span>
      </span>
    </button>
  );
}

export function PlanRail({
  steps,
  phases,
  focusedNodeId,
  onAim,
}: {
  steps: RunStepPresentation[];
  phases: Record<string, NodeAggregatePhase>;
  focusedNodeId: string | null;
  onAim: (nodeId: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const rows = condensePlan(steps, phases, expanded);

  return (
    <ol className="space-y-0.5" aria-label="The plan">
      {rows.map((row) =>
        row.kind === "step" ? (
          <li key={row.step.nodeId}>
            <StepRow
              row={row}
              focused={focusedNodeId === row.step.nodeId}
              onAim={onAim}
            />
          </li>
        ) : (
          <li key={row.key}>
            <button
              type="button"
              onClick={() =>
                setExpanded((prev) => new Set(prev).add(row.key))
              }
              className="flex w-full items-center gap-2.5 rounded-lg border border-transparent px-2.5 py-2 text-left hover:bg-muted/60"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
                <Check className="h-3.5 w-3.5 text-primary" aria-hidden />
              </span>
              <span className="flex-1 text-sm text-muted-foreground">
                {row.steps.length} steps done
              </span>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </button>
          </li>
        ),
      )}
      {expanded.size > 0 ? (
        <li>
          <button
            type="button"
            onClick={() => setExpanded(new Set())}
            className="flex w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-left text-[11px] text-muted-foreground hover:bg-muted/60"
          >
            <ChevronDown className="h-3 w-3" />
            Fold finished steps back up
          </button>
        </li>
      ) : null}
    </ol>
  );
}
