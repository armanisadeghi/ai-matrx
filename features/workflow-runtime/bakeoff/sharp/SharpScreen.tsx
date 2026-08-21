"use client";

/**
 * SharpScreen — the one live viewport of the tracker.
 *
 * Like a TV beside the channel list: the plan spine picks the channel, this
 * pane shows what's on. It auto-follows the step that is working right now;
 * clicking a spine row pins the viewport to that step, and "Back to live"
 * resumes following. The pane's frame is FIXED — content scrolls inside it,
 * so nothing on the page ever shifts as state arrives.
 *
 * Two tabs share the frame:
 *  - "Watching" — the followed step's internals, rendered ONLY through the
 *    canonical resolution (`InvocationBody`: lane → LiveRunDisplay, settled
 *    kind → its component, tail, error, honest working state).
 *  - "Delivered" — the promise fulfilled: every mid-run emission through
 *    `DbEmitRenderer` plus every declared deliverable, ghosted from frame
 *    zero and becoming real as each lands. Auto-fronted when the run ends.
 *
 * Lane promotion is viewer-driven and single-invocation only (fan-out
 * sibling lanes can never receive content — see FEATURE.md invariant 4).
 */

import { useEffect, useState } from "react";
import { PackageOpen, RotateCcw, SkipForward, Tv } from "lucide-react";

import { useAppSelector } from "@/lib/redux/hooks";
import IconResolver from "@/components/official/icons/IconResolver";
import { DbEmitRenderer } from "@/features/workflow-emit/DbEmitRenderer";
import type { EmitMode } from "@/features/workflow-emit/types";
import { cn } from "@/lib/utils";

import {
  InterruptCard,
  InvocationBody,
  PHASE_LABEL,
  PhaseIcon,
  RunErrorCard,
} from "../../components/readout-parts";
import { useWorkflowRunControls } from "../../hooks/useWorkflowRunControls";
import type { UseWorkflowRunResult } from "../../hooks/useWorkflowRun";
import {
  selectNodeAggregate,
  selectNodeAggregatePhases,
  selectRunEmissions,
  selectRunInterrupt,
  selectRunStatus,
} from "../../redux/workflow-runs.selectors";
import { TERMINAL_RUN_STATUSES } from "../../types";
import {
  FAMILY_ICON,
  FAMILY_STYLE,
  familyNoun,
  humanizeKind,
  type RunStepPresentation,
} from "../../components/run/node-presentation";
import { formatElapsed } from "@/components/official-candidate/elapsed-time/ElapsedTime";

export type SharpTab = "watching" | "delivered";

export function SharpScreen({
  runId,
  steps,
  stepsById,
  deliverables,
  viewedNodeId,
  following,
  onBackToLive,
  ensureLane,
  tab,
  onTabChange,
}: {
  runId: string;
  steps: RunStepPresentation[];
  stepsById: Record<string, RunStepPresentation>;
  /** Keepable deliverables (output.to_frontend excluded — those are emissions). */
  deliverables: RunStepPresentation[];
  viewedNodeId: string | null;
  following: boolean;
  onBackToLive: () => void;
  ensureLane: UseWorkflowRunResult["ensureLane"];
  tab: SharpTab;
  onTabChange: (tab: SharpTab) => void;
}) {
  const status = useAppSelector(selectRunStatus(runId));
  const interrupt = useAppSelector(selectRunInterrupt(runId));
  const emissions = useAppSelector(selectRunEmissions(runId));
  const phases = useAppSelector(selectNodeAggregatePhases(runId));
  const runOver = status !== null && TERMINAL_RUN_STATUSES.has(status);

  // Things actually in hand: deliberate emissions + settled deliverables.
  const deliveredCount =
    emissions.length +
    deliverables.filter((step) => phases[step.nodeId] === "settled").length;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
      {/* Tab row — fixed height, never moves. */}
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border px-2">
        <TabButton
          active={tab === "watching"}
          onClick={() => onTabChange("watching")}
          icon={Tv}
          label={runOver ? "The work" : "Watching"}
        />
        <TabButton
          active={tab === "delivered"}
          onClick={() => onTabChange("delivered")}
          icon={PackageOpen}
          label={`Delivered${deliveredCount > 0 ? ` · ${deliveredCount}` : ""}`}
        />
        <div className="flex-1" />
        {tab === "watching" && !following && !runOver ? (
          <button
            type="button"
            onClick={onBackToLive}
            className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/20"
          >
            Back to live
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin p-3">
        {/* A question from the run outranks everything on both tabs. */}
        {interrupt ? (
          <div className="mb-3">
            <InterruptCard runId={runId} />
          </div>
        ) : null}
        <RunErrorCard
          runId={runId}
          nodeLabels={Object.fromEntries(
            steps.map((s) => [s.nodeId, s.label]),
          )}
        />

        {tab === "watching" ? (
          viewedNodeId ? (
            <WatchedStep
              runId={runId}
              step={stepsById[viewedNodeId] ?? null}
              nodeId={viewedNodeId}
              ensureLane={ensureLane}
            />
          ) : (
            <p className="text-xs text-muted-foreground">
              Pick a step on the left to watch it.
            </p>
          )
        ) : (
          <DeliveredShelf
            runId={runId}
            deliverables={deliverables}
            stepsById={stepsById}
          />
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Tv;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition-colors",
        active
          ? "bg-muted font-medium text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
      aria-pressed={active}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

// ─── The watched step ───────────────────────────────────────────────────────

function WatchedStep({
  runId,
  step,
  nodeId,
  ensureLane,
}: {
  runId: string;
  step: RunStepPresentation | null;
  nodeId: string;
  ensureLane: UseWorkflowRunResult["ensureLane"];
}) {
  const aggregate = useAppSelector(selectNodeAggregate(runId, nodeId));
  const { retryNode, skipNode } = useWorkflowRunControls();
  const [busy, setBusy] = useState<"retry" | "skip" | null>(null);

  // Viewer-driven lane promotion — the watched step earns a streaming lane.
  // Single-invocation nodes only: a fan-out sibling lane can never receive
  // content (the wire's deltas carry node_id alone), so fan-out stays in the
  // tracked tier and renders tails + settled outputs per invocation.
  const single =
    aggregate.invocations.length === 1 && aggregate.expectedCount <= 1;
  const runningKey =
    single && aggregate.invocations[0].phase === "running"
      ? aggregate.invocations[0].invocationKey
      : null;
  const runningTail = single ? aggregate.invocations[0].textTail : "";
  const hasLane = single && aggregate.invocations[0].laneRequestId !== null;
  useEffect(() => {
    if (!runningKey || hasLane) return;
    ensureLane(runId, runningKey, runningTail || undefined);
  }, [runId, runningKey, hasLane, runningTail, ensureLane]);

  if (!step) {
    return (
      <p className="text-xs text-muted-foreground">
        This step isn&apos;t part of the current plan.
      </p>
    );
  }

  const style = FAMILY_STYLE[step.family];
  const failed = aggregate.phase === "failed";
  const fanOut = aggregate.expectedCount > 1 || aggregate.invocations.length > 1;
  const duration = aggregate.invocations.reduce<number | null>(
    (max, inv) =>
      inv.durationMs !== null && (max === null || inv.durationMs > max)
        ? inv.durationMs
        : max,
    null,
  );

  return (
    <div>
      {/* Step identity — one calm line, then the content speaks. */}
      <div className="mb-3 flex items-center gap-2.5">
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
            style.ring,
            style.bg,
          )}
        >
          <IconResolver
            iconName={step.iconName ?? FAMILY_ICON[step.family]}
            className={cn("h-4 w-4", style.text)}
          />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {step.label}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {familyNoun(step.family)}
            {step.outputKind
              ? ` · makes ${humanizeKind(step.outputKind).toLowerCase()}`
              : ""}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
          <PhaseIcon phase={aggregate.phase} />
          {PHASE_LABEL[aggregate.phase] ?? aggregate.phase}
          {fanOut && aggregate.expectedCount > 0 ? (
            <span className="tabular-nums">
              {aggregate.settledCount}/{aggregate.expectedCount}
            </span>
          ) : null}
          {duration !== null ? (
            <span className="tabular-nums">{formatElapsed(duration)}</span>
          ) : null}
        </span>
      </div>

      {failed ? (
        <div className="mb-3 flex items-center gap-2">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => {
              setBusy("retry");
              void retryNode(runId, nodeId).finally(() => setBusy(null));
            }}
            className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-foreground hover:bg-muted disabled:opacity-50"
          >
            <RotateCcw className="h-3 w-3" />
            {busy === "retry" ? "Trying…" : "Try this step again"}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => {
              setBusy("skip");
              void skipNode(runId, nodeId).finally(() => setBusy(null));
            }}
            className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            <SkipForward className="h-3 w-3" />
            {busy === "skip" ? "Skipping…" : "Skip it"}
          </button>
        </div>
      ) : null}

      {aggregate.invocations.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {aggregate.phase === "idle" || aggregate.phase === "waiting"
            ? "Up ahead — this starts once the steps before it finish."
            : "Nothing to show for this step."}
        </p>
      ) : (
        <div className="space-y-3">
          {aggregate.invocations.map((invocation, index) => (
            <div key={invocation.invocationKey}>
              {fanOut ? (
                <p className="mb-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <PhaseIcon phase={invocation.phase} />
                  Part {index + 1}
                  {invocation.durationMs !== null
                    ? ` · ${formatElapsed(invocation.durationMs)}`
                    : ""}
                </p>
              ) : null}
              <InvocationBody runId={runId} invocation={invocation} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── The delivered shelf ────────────────────────────────────────────────────

const EMIT_MODES: readonly EmitMode[] = [
  "confirmation",
  "summary",
  "full",
  "restructured",
];

/** The wire's mode string, narrowed; unknown modes render as "full". */
function asEmitMode(mode: string): EmitMode {
  return (EMIT_MODES as readonly string[]).includes(mode)
    ? (mode as EmitMode)
    : "full";
}

function DeliveredShelf({
  runId,
  deliverables,
  stepsById,
}: {
  runId: string;
  deliverables: RunStepPresentation[];
  stepsById: Record<string, RunStepPresentation>;
}) {
  const emissions = useAppSelector(selectRunEmissions(runId));

  if (deliverables.length === 0 && emissions.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        This workflow shows its results as it works — watch the steps on the
        left.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* What the run put on screen deliberately, in arrival order. */}
      {emissions.map((emission) => (
        <div
          key={emission.seq ?? `${emission.nodeId}:${emission.ts}`}
          className="rounded-lg border border-border bg-background p-3"
        >
          <p className="mb-2 text-[11px] font-medium text-muted-foreground">
            {emission.title ??
              stepsById[emission.nodeId]?.label ??
              "Shared with you"}
          </p>
          <DbEmitRenderer
            mode={asEmitMode(emission.mode)}
            payload={emission.payload}
            title={emission.title}
            nodeId={emission.nodeId}
            runId={runId}
            seq={emission.seq ?? 0}
            isPersisted={emission.persisted}
            componentRef={emission.componentRef}
          />
        </div>
      ))}

      {/* The declared deliverables — ghosted until each one lands. */}
      {deliverables.map((step) => (
        <DeliverableCard key={step.nodeId} runId={runId} step={step} />
      ))}
    </div>
  );
}

function DeliverableCard({
  runId,
  step,
}: {
  runId: string;
  step: RunStepPresentation;
}) {
  const aggregate = useAppSelector(selectNodeAggregate(runId, step.nodeId));
  const style = FAMILY_STYLE[step.family];
  const title = humanizeKind(step.outputKind ?? step.label);
  const settled = aggregate.invocations.filter(
    (inv) => inv.phase === "settled" && inv.output !== null,
  );

  if (settled.length === 0) {
    const failed = aggregate.phase === "failed";
    return (
      <div
        className={cn(
          "rounded-lg border border-dashed p-3",
          failed ? "border-destructive/40" : "border-border",
        )}
      >
        <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <IconResolver
            iconName={step.iconName ?? FAMILY_ICON[step.family]}
            className="h-3.5 w-3.5"
          />
          {title}
          <span className="font-normal">
            {failed
              ? "— this one hit a problem (see the step for what to do)"
              : aggregate.phase === "running" || aggregate.phase === "retrying"
                ? "— being made now"
                : `— coming up, from “${step.label}”`}
          </span>
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <p className="mb-2 flex items-center gap-2 text-xs font-medium text-foreground">
        <IconResolver
          iconName={step.iconName ?? FAMILY_ICON[step.family]}
          className={cn("h-3.5 w-3.5", style.text)}
        />
        {title}
      </p>
      <div className="space-y-3">
        {settled.map((invocation) => (
          <InvocationBody
            key={invocation.invocationKey}
            runId={runId}
            invocation={invocation}
            prefer="persisted"
          />
        ))}
      </div>
    </div>
  );
}
