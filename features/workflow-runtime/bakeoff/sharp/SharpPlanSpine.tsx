"use client";

/**
 * SharpPlanSpine — the whole plan, visible from frame zero.
 *
 * Every step of the DEFINITION renders immediately as one compact row —
 * icon, the author's label, live phase — joined by a hairline spine so it
 * reads as a route, not a table. Compact rows are what make 40 steps as
 * calm as 4: the list scrolls inside its own pane and the active step is
 * kept in view automatically while the viewport is following live.
 *
 * Clicking a row tunes the live viewport to that step (SharpScreen).
 */

import { useEffect, useRef } from "react";

import { useAppSelector } from "@/lib/redux/hooks";
import IconResolver from "@/components/official/icons/IconResolver";
import { cn } from "@/lib/utils";

import { PhaseIcon } from "../../components/readout-parts";
import {
  selectNodeAggregatePhases,
} from "../../redux/workflow-runs.selectors";
import {
  FAMILY_ICON,
  FAMILY_STYLE,
  type RunStepPresentation,
} from "../../components/run/node-presentation";

export function SharpPlanSpine({
  runId,
  steps,
  viewedNodeId,
  following,
  onSelect,
}: {
  runId: string;
  steps: RunStepPresentation[];
  viewedNodeId: string | null;
  /** True while the viewport is auto-following the live step. */
  following: boolean;
  onSelect: (nodeId: string) => void;
}) {
  const phases = useAppSelector(selectNodeAggregatePhases(runId));
  const activeRef = useRef<HTMLButtonElement | null>(null);

  // Keep the followed step in view — only while following, so a person
  // reading an earlier step is never yanked away from it.
  useEffect(() => {
    if (!following) return;
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [following, viewedNodeId]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
        <span className="text-xs font-medium text-foreground">The plan</span>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {steps.length} steps
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin py-1.5">
        {steps.map((step, index) => {
          const phase = phases[step.nodeId] ?? "idle";
          const style = FAMILY_STYLE[step.family];
          const viewed = step.nodeId === viewedNodeId;
          const active = phase === "running" || phase === "retrying";
          const upcoming = phase === "idle" || phase === "waiting";
          return (
            <button
              key={step.nodeId}
              ref={viewed ? activeRef : undefined}
              type="button"
              onClick={() => onSelect(step.nodeId)}
              className={cn(
                "group relative flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors",
                viewed ? "bg-muted/70" : "hover:bg-muted/40",
              )}
              aria-current={viewed ? "step" : undefined}
            >
              {/* the spine */}
              {index < steps.length - 1 ? (
                <span
                  aria-hidden
                  className="absolute left-[22.5px] top-[26px] h-[calc(100%-18px)] w-px bg-border"
                />
              ) : null}
              <span
                className={cn(
                  "relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
                  active
                    ? `${style.ring} ${style.bg}`
                    : "border-border bg-background",
                )}
              >
                <IconResolver
                  iconName={step.iconName ?? FAMILY_ICON[step.family]}
                  className={cn(
                    "h-3 w-3",
                    active || !upcoming ? style.text : "text-muted-foreground",
                  )}
                />
              </span>
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-xs",
                  upcoming ? "text-muted-foreground" : "text-foreground",
                  viewed && "font-medium",
                )}
              >
                {step.label}
              </span>
              <span className="shrink-0">
                <PhaseIcon phase={phase} />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
