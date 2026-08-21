"use client";

/**
 * Marquee — the top band of the Courier concept: one plain sentence of where
 * the delivery is, the clock, and THE PROMISE STRIP — every deliverable named
 * from frame zero as a chip that fills in the moment it lands. A filled chip
 * is a door: it points the camera at the step that produced it.
 *
 * Fixed vertical rhythm: both rows always render, so nothing below this band
 * ever moves as state arrives.
 */

import { Check, CircleDashed, OctagonX, Pause, Play, RotateCcw } from "lucide-react";

import { cn } from "@/lib/utils";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { ElapsedTime } from "@/components/official-candidate/elapsed-time/ElapsedTime";
import {
  humanizeKind,
  type RunStepPresentation,
} from "@/features/workflow-runtime/components/run/node-presentation";
import type { NodeAggregatePhase } from "@/features/workflow-runtime/redux/workflow-runs.selectors";

function ControlButton({
  label,
  icon,
  onClick,
  disabled,
  destructive,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50",
        destructive
          ? "border-destructive/40 text-destructive hover:bg-destructive/10"
          : "border-border text-foreground hover:bg-accent",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

export function Marquee({
  sentence,
  status,
  startedAt,
  endedAt,
  costUsd,
  deliverables,
  phases,
  onPickDeliverable,
  onPause,
  onResume,
  onStop,
  onRunAgain,
}: {
  sentence: string;
  /** The run's raw status, or null (no run yet / still connecting). */
  status: string | null;
  startedAt: string | null;
  endedAt: string | null;
  costUsd: number;
  deliverables: RunStepPresentation[];
  phases: Record<string, NodeAggregatePhase>;
  onPickDeliverable: (nodeId: string) => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onRunAgain: () => void;
}) {
  const running =
    status === "running" ||
    status === "pending" ||
    status === "pausing" ||
    status === "cancelling";
  const terminal =
    status === "completed" ||
    status === "failed" ||
    status === "errored" ||
    status === "cancelled";

  const askStop = () => {
    void confirm({
      title: "Stop this run?",
      description:
        "Anything already delivered stays yours. The steps still working will stop.",
      confirmLabel: "Stop the run",
      variant: "destructive",
    }).then((yes) => {
      if (yes) onStop();
    });
  };

  return (
    <header className="shrink-0 border-b border-border bg-card/60 px-4 pb-2.5 pt-3">
      <div className="flex items-center gap-3 pr-14">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
          {sentence}
        </p>
        <span className="flex shrink-0 items-center gap-2 text-xs tabular-nums text-muted-foreground">
          {startedAt ? (
            <ElapsedTime
              startedAt={startedAt}
              running={!terminal && status !== null}
              endedAt={terminal ? endedAt : null}
            />
          ) : null}
          {costUsd > 0 ? <span>${costUsd.toFixed(2)}</span> : null}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {status === "running" || status === "pending" ? (
            <ControlButton
              label="Pause"
              icon={<Pause className="h-3.5 w-3.5" />}
              onClick={onPause}
            />
          ) : null}
          {status === "paused" ? (
            <ControlButton
              label="Resume"
              icon={<Play className="h-3.5 w-3.5" />}
              onClick={onResume}
            />
          ) : null}
          {running || status === "paused" || status === "interrupted" ? (
            <ControlButton
              label="Stop"
              icon={<OctagonX className="h-3.5 w-3.5" />}
              onClick={askStop}
              destructive
            />
          ) : null}
          {terminal ? (
            <ControlButton
              label="Run it again"
              icon={<RotateCcw className="h-3.5 w-3.5" />}
              onClick={onRunAgain}
            />
          ) : null}
        </span>
      </div>

      {/* THE PROMISE STRIP — named before anything starts, filled as it lands. */}
      <div className="scrollbar-hide mt-2 flex items-center gap-1.5 overflow-x-auto">
        <span className="shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">
          {deliverables.length > 0 ? "You'll get" : "This one keeps its results for the next steps"}
        </span>
        {deliverables.map((step) => {
          const phase = phases[step.nodeId] ?? "idle";
          const landed = phase === "settled";
          const working =
            phase === "running" || phase === "retrying" || phase === "waiting";
          return (
            <button
              key={step.nodeId}
              type="button"
              onClick={() => onPickDeliverable(step.nodeId)}
              title={
                landed
                  ? "Delivered — tap to see it"
                  : working
                    ? "Being made right now"
                    : "Coming up"
              }
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                landed
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400"
                  : working
                    ? "animate-pulse border-primary/40 bg-primary/10 text-primary"
                    : "border-dashed border-border text-muted-foreground hover:bg-accent",
              )}
            >
              {landed ? (
                <Check className="h-3 w-3" />
              ) : (
                <CircleDashed className="h-3 w-3" />
              )}
              {humanizeKind(step.outputKind ?? step.label)}
            </button>
          );
        })}
      </div>
    </header>
  );
}
