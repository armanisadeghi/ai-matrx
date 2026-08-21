"use client";

/**
 * The Manifest — the left rail of the Commission dossier.
 *
 * Top: THE PROMISES — every deliverable named from frame zero, checking off
 * as it is actually delivered. Below: THE ROUTE — every step of the making,
 * present before the run starts, condensing as stretches finish (model.ts).
 * Clicking a step aims the focus window at it.
 */

import { Check, ChevronDown, ChevronRight, Gift } from "lucide-react";

import { cn } from "@/lib/utils";
import IconResolver from "@/components/official/icons/IconResolver";

import type { NodeAggregatePhase } from "../../redux/workflow-runs.selectors";
import {
  FAMILY_ICON,
  FAMILY_STYLE,
  humanizeKind,
  type RunStepPresentation,
} from "../../components/run/node-presentation";
import { PhaseIcon } from "../../components/readout-parts";
import { condenseRoute, standingOf, type RouteItem } from "./model";

export function PromiseList({
  deliverables,
  phases,
}: {
  deliverables: RunStepPresentation[];
  phases: Record<string, NodeAggregatePhase>;
}) {
  if (deliverables.length === 0) return null;
  return (
    <div className="space-y-1">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Gift className="h-3.5 w-3.5" />
        You will receive
      </p>
      <ul className="space-y-1">
        {deliverables.map((step) => {
          const delivered = phases[step.nodeId] === "settled";
          return (
            <li
              key={step.nodeId}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm",
                delivered
                  ? "border-emerald-500/40 bg-emerald-500/10 text-foreground"
                  : "border-dashed border-border bg-card text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                  delivered
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : "border-border",
                )}
              >
                {delivered ? <Check className="h-3 w-3" /> : null}
              </span>
              <span className="truncate">
                {step.outputKind ? humanizeKind(step.outputKind) : step.label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RouteStepRow({
  step,
  phase,
  focused,
  onAim,
}: {
  step: RunStepPresentation;
  phase: NodeAggregatePhase;
  focused: boolean;
  onAim: () => void;
}) {
  const style = FAMILY_STYLE[step.family];
  const live = standingOf(phase) === "live";
  return (
    <button
      type="button"
      onClick={onAim}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-sm transition-colors",
        focused
          ? "border-primary/50 bg-primary/5"
          : "border-transparent hover:bg-muted/60",
        live && !focused && "border-border bg-card",
      )}
    >
      <span
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
          style.bg,
          style.text,
        )}
      >
        <IconResolver
          iconName={step.iconName ?? FAMILY_ICON[step.family]}
          className="h-3.5 w-3.5"
        />
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          phase === "idle" ? "text-muted-foreground" : "text-foreground",
        )}
      >
        {step.label}
      </span>
      <PhaseIcon phase={phase} />
    </button>
  );
}

function FoldRow({
  item,
  onToggle,
}: {
  item: Extract<RouteItem, { kind: "fold" }>;
  onToggle: () => void;
}) {
  const done = item.standing === "done";
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={false}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-xs",
        done ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground",
        "hover:bg-muted/60",
      )}
    >
      <ChevronRight className="h-3.5 w-3.5 shrink-0" />
      {done ? (
        <>
          <Check className="h-3.5 w-3.5 shrink-0" />
          <span>{item.steps.length} steps done</span>
        </>
      ) : (
        <span>{item.steps.length} more steps ahead</span>
      )}
    </button>
  );
}

export function RouteList({
  steps,
  phases,
  expanded,
  onToggleFold,
  focusedNodeId,
  onAim,
}: {
  steps: RunStepPresentation[];
  phases: Record<string, NodeAggregatePhase>;
  expanded: Set<string>;
  onToggleFold: (key: string) => void;
  focusedNodeId: string | null;
  onAim: (nodeId: string) => void;
}) {
  const items = condenseRoute(steps, phases, expanded);
  return (
    <div className="space-y-1">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <ChevronDown className="h-3.5 w-3.5" />
        How it gets made
      </p>
      <div className="space-y-0.5">
        {items.map((item) =>
          item.kind === "step" ? (
            <RouteStepRow
              key={item.step.nodeId}
              step={item.step}
              phase={phases[item.step.nodeId] ?? "idle"}
              focused={item.step.nodeId === focusedNodeId}
              onAim={() => onAim(item.step.nodeId)}
            />
          ) : (
            <FoldRow
              key={item.key}
              item={item}
              onToggle={() => onToggleFold(item.key)}
            />
          ),
        )}
      </div>
    </div>
  );
}
