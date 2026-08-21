"use client";

/**
 * JourneyLine — the route of the delivery (Courier concept, ui-reimagine).
 *
 * Every step of the DEFINITION is on the line from frame zero, drawn as
 * stations on one vertical route (the courier map). Finished stretches fold
 * into a single bead so 40 steps read as a journey, not a wall; 8 or fewer
 * never fold. Clicking a station points the camera at it.
 *
 * Renders two shapes from the same data: the desktop column and a compact
 * horizontal strip for phones.
 */

import { Check, ChevronDown, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import IconResolver from "@/components/official/icons/IconResolver";
import {
  FAMILY_ICON,
  FAMILY_STYLE,
  type RunStepPresentation,
} from "@/features/workflow-runtime/components/run/node-presentation";
import type { NodeAggregatePhase } from "@/features/workflow-runtime/redux/workflow-runs.selectors";

import { compressJourney, type JourneyRow } from "./camera";

function phaseWord(phase: NodeAggregatePhase | undefined): string | null {
  switch (phase) {
    case "running":
      return "working";
    case "retrying":
      return "trying again";
    case "waiting":
      return "waiting";
    case "failed":
      return "needs attention";
    case "skipped":
      return "not needed";
    default:
      return null;
  }
}

function StationDot({
  step,
  phase,
  followed,
}: {
  step: RunStepPresentation;
  phase: NodeAggregatePhase | undefined;
  followed: boolean;
}) {
  const style = FAMILY_STYLE[step.family];
  const finished = phase === "settled" || phase === "skipped";
  const active = phase === "running" || phase === "retrying";
  return (
    <span
      className={cn(
        "relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-background transition-colors",
        finished
          ? cn(style.ring, style.bg)
          : active
            ? cn(style.ring, style.bg)
            : "border-border",
        followed && "ring-2 ring-primary/40",
      )}
    >
      {finished ? (
        <Check className={cn("h-3.5 w-3.5", style.text)} />
      ) : (
        <IconResolver
          iconName={step.iconName ?? FAMILY_ICON[step.family]}
          size={13}
          className={cn(
            active ? style.text : "text-muted-foreground",
            active && "animate-pulse",
          )}
        />
      )}
    </span>
  );
}

export function JourneyLine({
  steps,
  phases,
  followedNodeId,
  onPick,
  expandedFolds,
  onToggleFold,
}: {
  steps: RunStepPresentation[];
  phases: Record<string, NodeAggregatePhase>;
  followedNodeId: string | null;
  onPick: (nodeId: string) => void;
  expandedFolds: ReadonlySet<string>;
  onToggleFold: (foldKey: string) => void;
}) {
  const rows = compressJourney(steps, phases, followedNodeId, expandedFolds);
  return (
    <nav aria-label="The route" className="relative px-3 py-3">
      {/* The route line itself. */}
      <span
        aria-hidden
        className="absolute bottom-5 left-[23px] top-5 w-px bg-border"
      />
      <ul className="space-y-0.5">
        {rows.map((row) =>
          row.kind === "fold" ? (
            <FoldRow
              key={`fold:${row.steps[0].nodeId}`}
              row={row}
              onToggle={() => onToggleFold(row.steps[0].nodeId)}
            />
          ) : (
            <StepRow
              key={row.step.nodeId}
              step={row.step}
              phase={phases[row.step.nodeId]}
              followed={row.step.nodeId === followedNodeId}
              onPick={() => onPick(row.step.nodeId)}
            />
          ),
        )}
      </ul>
    </nav>
  );
}

function StepRow({
  step,
  phase,
  followed,
  onPick,
}: {
  step: RunStepPresentation;
  phase: NodeAggregatePhase | undefined;
  followed: boolean;
  onPick: () => void;
}) {
  const word = phaseWord(phase);
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        aria-current={followed ? "step" : undefined}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-accent",
          followed && "bg-accent",
        )}
      >
        <StationDot step={step} phase={phase} followed={followed} />
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block truncate text-xs",
              phase === "idle" || phase === undefined
                ? "text-muted-foreground"
                : "font-medium text-foreground",
            )}
          >
            {step.label}
          </span>
          {word ? (
            <span
              className={cn(
                "block text-[10px] leading-tight",
                phase === "failed" ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {word}
            </span>
          ) : null}
        </span>
      </button>
    </li>
  );
}

function FoldRow({ row, onToggle }: { row: JourneyRow & { kind: "fold" }; onToggle: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-accent"
      >
        <span className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-muted">
          <Check className="h-3.5 w-3.5 text-muted-foreground" />
        </span>
        <span className="min-w-0 flex-1 text-xs text-muted-foreground">
          {row.steps.length} steps done
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>
    </li>
  );
}

/**
 * The phone shape of the same route: one horizontal strip of stations, the
 * followed one labeled. Scrolls sideways inside itself — never widens the page.
 */
export function JourneyStrip({
  steps,
  phases,
  followedNodeId,
  onPick,
}: {
  steps: RunStepPresentation[];
  phases: Record<string, NodeAggregatePhase>;
  followedNodeId: string | null;
  onPick: (nodeId: string) => void;
}) {
  const followed = steps.find((s) => s.nodeId === followedNodeId) ?? null;
  return (
    <div className="border-b border-border px-3 py-2">
      <div className="scrollbar-hide flex items-center gap-1 overflow-x-auto">
        {steps.map((step, index) => (
          <span key={step.nodeId} className="flex shrink-0 items-center">
            {index > 0 ? (
              <ChevronRight aria-hidden className="h-3 w-3 text-muted-foreground/50" />
            ) : null}
            <button
              type="button"
              onClick={() => onPick(step.nodeId)}
              aria-label={step.label}
              aria-current={step.nodeId === followedNodeId ? "step" : undefined}
              className="p-0.5"
            >
              <StationDot
                step={step}
                phase={phases[step.nodeId]}
                followed={step.nodeId === followedNodeId}
              />
            </button>
          </span>
        ))}
      </div>
      {followed ? (
        <p className="mt-1 truncate text-[11px] text-muted-foreground">
          {followed.label}
          {phaseWord(phases[followed.nodeId])
            ? ` — ${phaseWord(phases[followed.nodeId])}`
            : ""}
        </p>
      ) : null}
    </div>
  );
}
