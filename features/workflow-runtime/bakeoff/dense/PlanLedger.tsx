"use client";

/**
 * PlanLedger — every step of the DEFINITION as one compact ledger row, from
 * frame zero. 4 steps or 40: rows are ~30px, the column scrolls, and a sticky
 * summary keeps the score in view. A running row carries the step's own live
 * progress line (its internals, one line at a time) — the ledger is never a
 * wall of idle labels.
 *
 * Clicking a row pins it in the magnifier — every step is a door.
 */

import { Package } from "lucide-react";

import { useAppSelector } from "@/lib/redux/hooks";
import IconResolver from "@/components/official/icons/IconResolver";
import { cn } from "@/lib/utils";

import { selectRunState } from "../../redux/workflow-runs.selectors";
import { PHASE_LABEL, PhaseIcon } from "../../components/readout-parts";
import type { NodeInvocationState } from "../../redux/workflow-runs.slice";
import {
  FAMILY_ICON,
  FAMILY_STYLE,
  type RunStepPresentation,
} from "../../components/run/node-presentation";

function fmtDuration(ms: number): string {
  const total = Math.max(1, Math.round(ms / 1000));
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

interface RowFacts {
  phase: string;
  progressLine: string | null;
  durationMs: number | null;
  settled: number;
  expected: number;
}

function aggregateRow(
  invocations: NodeInvocationState[],
  expectedCount: number,
): RowFacts {
  if (invocations.length === 0) {
    return {
      phase: "idle",
      progressLine: null,
      durationMs: null,
      settled: 0,
      expected: expectedCount,
    };
  }
  const running = invocations.some((i) => i.phase === "running");
  const retrying = invocations.some((i) => i.phase === "retrying");
  const failed = invocations.some((i) => i.phase === "failed");
  const settledInvs = invocations.filter(
    (i) => i.phase === "settled" || i.phase === "skipped",
  );
  const complete =
    settledInvs.length >= Math.max(expectedCount, invocations.length);
  const phase = running
    ? "running"
    : retrying
      ? "retrying"
      : !complete
        ? "running"
        : failed
          ? "failed"
          : invocations.every((i) => i.phase === "skipped")
            ? "skipped"
            : "settled";
  const progressLine =
    invocations.find((i) => i.phase === "running" && i.progress?.message)
      ?.progress?.message ?? null;
  const durations = invocations
    .map((i) => i.durationMs)
    .filter((d): d is number => d !== null);
  return {
    phase,
    progressLine,
    durationMs:
      durations.length > 0 && phase === "settled"
        ? durations.reduce((a, b) => a + b, 0)
        : null,
    settled: settledInvs.length,
    expected: Math.max(expectedCount, invocations.length),
  };
}

export function PlanLedger({
  runId,
  steps,
  selectedNodeId,
  pinnedNodeId,
  onSelect,
  className,
}: {
  runId: string;
  steps: RunStepPresentation[];
  selectedNodeId: string | null;
  pinnedNodeId: string | null;
  onSelect: (nodeId: string) => void;
  className?: string;
}) {
  const run = useAppSelector(selectRunState(runId));

  const doneCount = steps.filter((step) => {
    const aggregate = run?.nodeAggregates[step.nodeId];
    if (!aggregate || !run) return false;
    const invocations = aggregate.invocationKeys
      .map((key) => run.nodes[key])
      .filter((i): i is NodeInvocationState => i !== undefined);
    const facts = aggregateRow(invocations, aggregate.expectedCount);
    return facts.phase === "settled" || facts.phase === "skipped";
  }).length;

  return (
    <div className={cn("max-h-72 overflow-y-auto lg:max-h-none", className)}>
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border/60 bg-background px-3 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          The plan
        </span>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {doneCount}/{steps.length} done
        </span>
      </div>
      <ol className="py-1">
        {steps.map((step, index) => {
          const style = FAMILY_STYLE[step.family];
          const aggregate = run?.nodeAggregates[step.nodeId];
          const invocations =
            run && aggregate
              ? aggregate.invocationKeys
                  .map((key) => run.nodes[key])
                  .filter((i): i is NodeInvocationState => i !== undefined)
              : [];
          const facts = aggregateRow(invocations, aggregate?.expectedCount ?? 0);
          const childRunId = run?.childRunsByNode[step.nodeId] ?? null;
          const selected = step.nodeId === selectedNodeId;
          const busy = facts.phase === "running" || facts.phase === "retrying";
          return (
            <li key={step.nodeId}>
              <button
                type="button"
                onClick={() => onSelect(step.nodeId)}
                aria-current={selected ? "true" : undefined}
                className={cn(
                  "block w-full px-2 py-1.5 text-left transition-colors hover:bg-accent/50",
                  selected && "bg-accent",
                  selected &&
                    step.nodeId === pinnedNodeId &&
                    "ring-1 ring-inset ring-primary/40",
                  busy && !selected && "bg-primary/5",
                )}
              >
                <span className="flex items-center gap-2">
                  <span className="w-5 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                    {index + 1}
                  </span>
                  <IconResolver
                    iconName={step.iconName ?? FAMILY_ICON[step.family]}
                    className={cn("h-3.5 w-3.5 shrink-0", style.text)}
                  />
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-xs",
                      facts.phase === "idle"
                        ? "text-muted-foreground"
                        : "text-foreground",
                    )}
                  >
                    {step.label}
                  </span>
                  {step.outputKind ? (
                    <Package className="h-3 w-3 shrink-0 text-emerald-600/70 dark:text-emerald-400/70" />
                  ) : null}
                  {facts.expected > 1 ? (
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                      {facts.settled}/{facts.expected}
                    </span>
                  ) : null}
                  {facts.durationMs !== null ? (
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                      {fmtDuration(facts.durationMs)}
                    </span>
                  ) : null}
                  <span
                    className="shrink-0"
                    title={PHASE_LABEL[facts.phase] ?? facts.phase}
                  >
                    <PhaseIcon phase={facts.phase} />
                  </span>
                </span>
                {busy && facts.progressLine ? (
                  <span className="mt-0.5 block truncate pl-7 text-[11px] text-muted-foreground">
                    {facts.progressLine}
                  </span>
                ) : null}
              </button>
              {childRunId ? (
                <a
                  href={`/workflows/runs/${childRunId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate px-2 pb-1 pl-9 text-[11px] text-primary underline-offset-2 hover:underline"
                >
                  Watch its sub-workflow
                </a>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
