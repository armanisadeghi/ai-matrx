"use client";

/**
 * RefineRunPage — the bakeoff/refine take on the auto-generated workflow run
 * page. One page, whole lifecycle: intake → live run → the goods.
 *
 * Modeled on the structure of a great deployment page (Vercel's): a stable
 * summary header, the full step checklist visible from frame zero with live
 * durations, a real event log, and the artifacts at the end — retold in plain
 * language for a non-technical expert.
 *
 * Layout law: the plan rail and the two live panels hold FIXED footprints;
 * the only thing that grows is the delivery shelf at the bottom. A refresh
 * mid-run resumes from the durable log (?run= carries the run id).
 */

import { useEffect, useState } from "react";
import {
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import { ArrowLeft, ListChecks } from "lucide-react";

import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { ElapsedTime } from "@/components/official-candidate/elapsed-time/ElapsedTime";

import { RunStatusChip } from "../../run-status";
import { useWorkflowRun } from "../../hooks/useWorkflowRun";
import { useWorkflowRunControls } from "../../hooks/useWorkflowRunControls";
import {
  selectRunActivity,
  selectRunCostTotal,
  selectRunStartedAt,
  selectRunState,
  selectRunStatusTs,
} from "../../redux/workflow-runs.selectors";
import {
  deliverableSteps,
  describeWorkflowSteps,
  humanizeKind,
  type RunStepPresentation,
} from "../../components/run/node-presentation";
import { deriveRunForm } from "../../surface/run-form";
import { fetchWorkflowDefinition } from "../../surface/service";
import { TERMINAL_RUN_STATUSES } from "../../types";
import type { WorkflowDefinitionLike } from "../../trigger-points";

import { buildStepViews, spotlightStep, terminalStepIds } from "./plan-view";
import { PlanRail, PlanStrip } from "./PlanRail";
import { IntakePanel } from "./IntakePanel";
import { LiveDesk } from "./LiveDesk";
import { DeliveryShelf, EmissionRoll } from "./DeliveryShelf";

interface LoadedDefinition {
  id: string;
  name: string;
  definition: WorkflowDefinitionLike;
  steps: RunStepPresentation[];
}

type DefinitionLoad =
  | { state: "loading" }
  | { state: "error"; error: unknown }
  | { state: "missing" }
  | { state: "ready"; value: LoadedDefinition };

/** The promise strip — every deliverable named before anything starts. One
 * fixed-height horizontal row; chips fill in as their steps settle. */
function PromiseStrip({
  steps,
  completedNodes,
}: {
  steps: RunStepPresentation[];
  completedNodes: Record<string, true>;
}) {
  const deliverables = deliverableSteps(steps);
  return (
    <div className="flex h-9 shrink-0 items-center gap-2 overflow-hidden">
      <span className="shrink-0 text-xs font-medium text-muted-foreground">
        You&apos;ll get:
      </span>
      <div className="scrollbar-hide flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
        {deliverables.length > 0 ? (
          deliverables.map((step) => {
            const done = completedNodes[step.nodeId] === true;
            return (
              <span
                key={step.nodeId}
                className={cn(
                  "shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
                  done
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    : "border-dashed border-border text-muted-foreground",
                )}
              >
                {humanizeKind(step.outputKind ?? step.label)}
              </span>
            );
          })
        ) : (
          <span className="text-[11px] text-muted-foreground">
            Results appear on this page as it works.
          </span>
        )}
      </div>
    </div>
  );
}

/** Layout-true loading skeleton — the page's real shapes, pulsing. */
function PageSkeleton() {
  return (
    <div className="grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
      <div className="hidden h-96 animate-pulse rounded-xl border border-border bg-card lg:block" />
      <div className="space-y-3">
        <div className="h-9 animate-pulse rounded-lg bg-muted/60" />
        <div className="h-64 animate-pulse rounded-xl border border-border bg-card" />
        <div className="h-40 animate-pulse rounded-xl border border-border bg-card" />
      </div>
    </div>
  );
}

export function RefineRunPage({ definitionId }: { definitionId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [load, setLoad] = useState<DefinitionLoad>({ state: "loading" });
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoad({ state: "loading" });
    fetchWorkflowDefinition(definitionId)
      .then((row) => {
        if (cancelled) return;
        if (!row) {
          setLoad({ state: "missing" });
          return;
        }
        setLoad({
          state: "ready",
          value: {
            id: row.id,
            name: row.name,
            definition: row.definition,
            steps: describeWorkflowSteps(row.definition),
          },
        });
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoad({ state: "error", error });
      });
    return () => {
      cancelled = true;
    };
  }, [definitionId, retryToken]);

  // The run this page is following — the URL is the source of truth so a
  // refresh mid-run resumes exactly where it was.
  const runId = searchParams.get("run");
  const { ensureLane } = useWorkflowRun(runId);
  const { startRun, starting } = useWorkflowRunControls();

  const run = useAppSelector(selectRunState(runId ?? ""));
  const activity = useAppSelector(selectRunActivity(runId ?? ""));
  const costTotal = useAppSelector(selectRunCostTotal(runId ?? ""));
  const startedAt = useAppSelector(selectRunStartedAt(runId ?? ""));
  const statusTs = useAppSelector(selectRunStatusTs(runId ?? ""));

  const ready = load.state === "ready" ? load.value : null;
  const steps = ready?.steps ?? [];
  const stepViews = buildStepViews(steps, run);
  const status = run?.status ?? null;
  const runOver = status !== null && TERMINAL_RUN_STATUSES.has(status);

  // Keep the step under the spotlight streaming: promote its lane (single-
  // invocation steps only — fan-out deltas stay in the tracked tier).
  const spotlight = spotlightStep(stepViews);
  const spotlightInvocation =
    spotlight &&
    spotlight.invocations.length === 1 &&
    spotlight.expectedCount <= 1
      ? spotlight.invocations[0]
      : null;
  useEffect(() => {
    if (!runId || !spotlightInvocation) return;
    if (
      spotlightInvocation.phase === "running" &&
      spotlightInvocation.laneRequestId === null
    ) {
      ensureLane(
        runId,
        spotlightInvocation.invocationKey,
        spotlightInvocation.textTail || undefined,
      );
    }
  }, [runId, spotlightInvocation, ensureLane]);

  const stepLabels: Record<string, string> = {};
  for (const step of steps) stepLabels[step.nodeId] = step.label;

  const deliverableViews = stepViews.filter(
    (view) => view.step.outputKind !== null,
  );
  const finalsIds = ready ? terminalStepIds(ready.definition) : new Set<string>();
  const fallbackFinals = stepViews.filter((view) =>
    finalsIds.has(view.step.nodeId),
  );

  const handleStart = (nodeInputs: Record<string, Record<string, unknown>>) => {
    if (!ready) return;
    void startRun({ definitionId: ready.id, nodeInputs }).then((newRunId) => {
      if (newRunId) {
        router.replace(`${pathname}?run=${newRunId}`, { scroll: false });
      }
    });
  };

  const header = (
    <RouteHeader
      left={
        <div className="flex min-w-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Back"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="truncate text-sm font-medium text-foreground">
            {ready?.name ?? "Workflow"}
          </span>
        </div>
      }
      right={
        runId ? (
          <div className="flex items-center gap-2 pr-2">
            {costTotal > 0 ? (
              <span className="hidden text-[11px] tabular-nums text-muted-foreground sm:inline">
                ${costTotal.toFixed(2)}
              </span>
            ) : null}
            <ElapsedTime
              startedAt={startedAt}
              running={status !== null && !runOver}
              endedAt={runOver ? statusTs : null}
              className="text-[11px] tabular-nums text-muted-foreground"
            />
            <RunStatusChip status={status ?? "pending"} />
          </div>
        ) : null
      }
    />
  );

  if (load.state === "loading") {
    return (
      <>
        {header}
        <div className="h-full overflow-hidden">
          <div className="scrollbar-thin h-full overflow-y-auto">
            <div className="mx-auto w-full max-w-6xl px-3 pb-8 pt-[calc(var(--shell-header-h)+0.75rem)] sm:px-4">
              <PageSkeleton />
            </div>
          </div>
        </div>
      </>
    );
  }

  if (load.state === "missing" || load.state === "error") {
    return (
      <>
        {header}
        <div className="h-full overflow-hidden">
          <div className="scrollbar-thin h-full overflow-y-auto">
            <div className="mx-auto w-full max-w-3xl px-3 pb-8 pt-[calc(var(--shell-header-h)+0.75rem)] sm:px-4">
              <AccessGate
                token="workflow"
                id={definitionId}
                error={load.state === "error" ? load.error : null}
                onRetry={() => setRetryToken((token) => token + 1)}
                fallbackHref="/workflows/all"
                fallbackLabel="All workflows"
              />
            </div>
          </div>
        </div>
      </>
    );
  }

  if (steps.length === 0) {
    return (
      <>
        {header}
        <div className="h-full overflow-hidden">
          <div className="scrollbar-thin h-full overflow-y-auto">
            <div className="mx-auto w-full max-w-3xl px-3 pb-8 pt-[calc(var(--shell-header-h)+0.75rem)] sm:px-4">
              <div className="rounded-xl border border-border bg-card p-6 text-center">
                <ListChecks className="mx-auto h-6 w-6 text-muted-foreground" />
                <h2 className="mt-2 text-sm font-medium text-foreground">
                  This workflow has no steps yet
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Once its steps are defined, this page runs them and shows you
                  everything they make.
                </p>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {header}
      <div className="h-full overflow-hidden">
        <div className="scrollbar-thin h-full overflow-y-auto">
          <div className="mx-auto w-full max-w-6xl px-3 pb-10 pt-[calc(var(--shell-header-h)+0.75rem)] sm:px-4">
            <PromiseStrip
              steps={steps}
              completedNodes={run?.sticky.completedNodes ?? {}}
            />

            {/* Mobile plan strip (the rail is desktop-only). */}
            <div className="mt-1 lg:hidden">
              <PlanStrip views={stepViews} />
            </div>

            <div className="mt-2 gap-4 lg:grid lg:grid-cols-[280px_minmax(0,1fr)]">
              <aside className="hidden lg:sticky lg:top-[calc(var(--shell-header-h)+0.75rem)] lg:block lg:h-[calc(100dvh-var(--shell-header-h)-2.5rem)] lg:self-start">
                <PlanRail views={stepViews} />
              </aside>

              <div className="min-w-0 space-y-4">
                {runId ? (
                  <>
                    <LiveDesk
                      runId={runId}
                      status={status}
                      views={stepViews}
                      activity={activity}
                      stepLabels={stepLabels}
                      onStartAnother={() =>
                        router.replace(pathname, { scroll: false })
                      }
                    />
                    <EmissionRoll
                      runId={runId}
                      emissions={run?.emissions ?? []}
                      stepLabels={stepLabels}
                    />
                    <DeliveryShelf
                      runId={runId}
                      deliverables={deliverableViews}
                      fallbackFinals={fallbackFinals}
                      runOver={runOver}
                    />
                  </>
                ) : (
                  <IntakePanel
                    sections={deriveRunForm(ready!.definition)}
                    starting={starting}
                    deliverableNames={deliverableSteps(steps).map((step) =>
                      humanizeKind(step.outputKind ?? step.label),
                    )}
                    stepCount={steps.length}
                    onStart={handleStart}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
