"use client";

/**
 * PlanColumn — the whole journey, folded so the present stays on top.
 *
 * Every step of the DEFINITION is here from frame zero (idle rows are the
 * declared geometry; the run only fills them in). Finished stretches fold
 * into "n steps done" seams and the far future folds into "n steps ahead"
 * (plan-model.ts), so 4 steps and 40 steps both read at a glance. Clicking a
 * step aims the focus window at it; the followed step carries the accent bar.
 */

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { getIconComponent } from "@/components/official/icons/IconResolver";
import type { NodeAggregatePhase } from "../../redux/workflow-runs.selectors";
import { PHASE_LABEL, PhaseIcon } from "../../components/readout-parts";
import {
  FAMILY_ICON,
  FAMILY_STYLE,
  humanizeKind,
  type RunStepPresentation,
} from "../../components/run/node-presentation";
import { buildPlanRows } from "./plan-model";

function stepDurationLabel(durationMs: number | null): string | null {
  if (durationMs === null || durationMs <= 0) return null;
  if (durationMs < 1000) return "<1s";
  const seconds = Math.round(durationMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function PlanColumn({
  steps,
  byNodeId,
  phases,
  durations,
  focusNodeId,
  onAim,
}: {
  steps: RunStepPresentation[];
  byNodeId: Record<string, RunStepPresentation>;
  phases: Record<string, NodeAggregatePhase>;
  /** nodeId → total duration ms (settled steps only). */
  durations: Record<string, number>;
  focusNodeId: string | null;
  onAim: (nodeId: string) => void;
}) {
  const [openSeams, setOpenSeams] = useState<ReadonlySet<string>>(new Set());
  const order = steps.map((step) => step.nodeId);
  const rows = buildPlanRows(order, phases, { focusNodeId, openSeams });

  return (
    <ol className="space-y-1" aria-label="The plan">
      {rows.map((row) => {
        if (row.kind === "seam") {
          const label =
            row.tone === "done"
              ? `${row.nodeIds.length} steps done`
              : `${row.nodeIds.length} more steps ahead`;
          return (
            <li key={row.seamId}>
              <button
                type="button"
                onClick={() =>
                  setOpenSeams((prev) => new Set(prev).add(row.seamId))
                }
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg border border-dashed px-2.5 py-1.5 text-xs transition-colors hover:bg-muted/60",
                  row.tone === "done"
                    ? "border-border text-muted-foreground"
                    : "border-border/70 text-muted-foreground/80",
                )}
              >
                <ChevronRight className="h-3 w-3 shrink-0" />
                <span>{label}</span>
                {row.tone === "done" ? (
                  <PhaseIcon phase="settled" />
                ) : null}
              </button>
            </li>
          );
        }

        const step = byNodeId[row.nodeId];
        if (!step) return null;
        const phase = phases[row.nodeId] ?? "idle";
        const focused = row.nodeId === focusNodeId;
        const style = FAMILY_STYLE[step.family];
        const Icon = getIconComponent(
          step.iconName ?? FAMILY_ICON[step.family],
          FAMILY_ICON[step.family],
        );
        const duration = stepDurationLabel(durations[row.nodeId] ?? null);
        const working = phase === "running" || phase === "retrying";

        return (
          <li key={row.nodeId}>
            <button
              type="button"
              onClick={() => onAim(row.nodeId)}
              aria-current={focused ? "step" : undefined}
              className={cn(
                "group flex w-full items-center gap-2 rounded-lg border-l-2 px-2.5 py-1.5 text-left transition-colors",
                focused
                  ? "border-l-primary bg-primary/5"
                  : "border-l-transparent hover:bg-muted/60",
                phase === "idle" && !focused && "opacity-70",
              )}
            >
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
                  style.bg,
                )}
              >
                <Icon className={cn("h-3.5 w-3.5", style.text)} />
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block truncate text-xs font-medium",
                    phase === "idle" ? "text-muted-foreground" : "text-foreground",
                  )}
                >
                  {step.label}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {working
                    ? PHASE_LABEL[phase]
                    : step.outputKind
                      ? `Makes: ${humanizeKind(step.outputKind)}`
                      : phase === "idle"
                        ? "Up ahead"
                        : PHASE_LABEL[phase]}
                  {duration && (phase === "settled" || phase === "skipped")
                    ? ` · ${duration}`
                    : ""}
                </span>
              </span>
              <PhaseIcon phase={phase} />
            </button>
          </li>
        );
      })}
      {openSeams.size > 0 ? (
        <li>
          <button
            type="button"
            onClick={() => setOpenSeams(new Set())}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <ChevronDown className="h-3 w-3 rotate-180" />
            Fold finished steps back up
          </button>
        </li>
      ) : null}
    </ol>
  );
}
