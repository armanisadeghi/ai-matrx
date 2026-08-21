"use client";

/**
 * RefineRunPage — the ui-refine bake-off take on the auto-generated workflow
 * run page (`/workflows/bakeoff/refine-2/[id]`).
 *
 * Reference product: a premium parcel-tracking page executed with Linear's
 * timeline craft. The whole lifecycle is ONE page whose shape never changes:
 *  - the promise strip names every deliverable from frame zero,
 *  - the plan column shows every step immediately and condenses finished
 *    stretches ("n steps done") so 4 and 40 steps both read well,
 *  - ONE focus panel shows a step's internals at full fidelity — it
 *    auto-follows the freshest work, can be aimed anywhere, and is the only
 *    place a streaming lane is spent,
 *  - the activity feed narrates the real tools/phases/durations,
 *  - the delivered section turns each promise into its real kind component.
 *
 * Data layer is 100% canonical: adoptWorkflowRun (via useWorkflowRun),
 * workflowRuns selectors, InvocationBody, DbEmitRenderer, activity-copy,
 * deriveRunForm, useWorkflowRunControls. Presentation only lives here.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  CircleDollarSign,
  Clock,
  OctagonX,
  Pause,
  Play,
  SearchX,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ElapsedTime } from "@/components/official-candidate/elapsed-time/ElapsedTime";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";

import { useWorkflowRun } from "../../hooks/useWorkflowRun";
import { useWorkflowRunControls } from "../../hooks/useWorkflowRunControls";
import {
  selectNodeAggregatePhases,
  selectRunCostTotal,
  selectRunStartedAt,
  selectRunStatus,
  selectRunStatusTs,
} from "../../redux/workflow-runs.selectors";
import {
  fetchRunDefinitionId,
  fetchWorkflowDefinition,
  listRecentRuns,
  type RecentRunSummary,
} from "../../surface/service";
import { deriveRunForm } from "../../surface/run-form";
import {
  deliverableSteps,
  describeWorkflowSteps,
  humanizeKind,
} from "../../components/run/node-presentation";
import { InterruptCard, RunErrorCard } from "../../components/readout-parts";
import { RunStatusChip } from "../../run-status";
import { TERMINAL_RUN_STATUSES, type WorkflowRunStatus } from "../../types";
import type { WorkflowDefinitionLike } from "../../trigger-points";

import { PlanRail } from "./PlanRail";
import { FocusPanel } from "./FocusPanel";
import { ActivityFeed } from "./ActivityFeed";
import { DeliveredSection } from "./DeliveredSection";
import { IntakeCard } from "./IntakeCard";
import { pickFollowTarget, planSummary } from "./plan-model";

type Resolution =
  | { phase: "loading" }
  /** The id opened nothing — a plain, fast answer, never a spinner. */
  | { phase: "missing"; detail: string }
  | {
      phase: "ready";
      definitionId: string;
      name: string;
      definition: WorkflowDefinitionLike;
      /** Set when the [id] in the path was actually a RUN id. */
      runIdFromPath: string | null;
    };

const BASE = "/workflows/bakeoff/refine-2";

/**
 * "errored" is a terminal fact for THIS page even though it is not in the
 * generated TERMINAL set (verified live: a run the engine records as
 * `errored` never moves again) — the clock freezes, controls hide, and the
 * "run it again" door opens.
 */
function runIsOver(status: WorkflowRunStatus | null): boolean {
  return (
    status !== null &&
    (TERMINAL_RUN_STATUSES.has(status) || status === "errored")
  );
}

export function RefineRunPage({ id }: { id: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const runParam = searchParams.get("run");

  const [resolution, setResolution] = useState<Resolution>({
    phase: "loading",
  });
  const [recentRuns, setRecentRuns] = useState<RecentRunSummary[]>([]);
  /** A `?run=` id that probed as unreachable — fail fast, offer the way out. */
  const [badRunId, setBadRunId] = useState<string | null>(null);

  // Probe the [id]: a workflow definition first, then a run id — one honest
  // "missing" answer when it is neither.
  useEffect(() => {
    let cancelled = false;
    setResolution({ phase: "loading" });
    (async () => {
      try {
        const asDefinition = await fetchWorkflowDefinition(id);
        if (asDefinition) {
          if (!cancelled) {
            setResolution({
              phase: "ready",
              definitionId: asDefinition.id,
              name: asDefinition.name,
              definition: asDefinition.definition,
              runIdFromPath: null,
            });
          }
          return;
        }
        const definitionId = await fetchRunDefinitionId(id);
        if (definitionId) {
          const viaRun = await fetchWorkflowDefinition(definitionId);
          if (!cancelled && viaRun) {
            setResolution({
              phase: "ready",
              definitionId: viaRun.id,
              name: viaRun.name,
              definition: viaRun.definition,
              runIdFromPath: id,
            });
            return;
          }
        }
        if (!cancelled) {
          setResolution({
            phase: "missing",
            detail:
              "Nothing here answers to that id — it may have been removed, or it may not be shared with you.",
          });
        }
      } catch {
        if (!cancelled) {
          setResolution({
            phase: "missing",
            detail:
              "We couldn't reach this workflow right now. Check your connection and try again.",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const definitionId =
    resolution.phase === "ready" ? resolution.definitionId : null;

  // Recent runs feed the intake card's "earlier runs" doors.
  useEffect(() => {
    if (!definitionId) return;
    let cancelled = false;
    listRecentRuns(definitionId)
      .then((runs) => {
        if (!cancelled) setRecentRuns(runs);
      })
      .catch(() => {
        // Non-fatal: the intake still works with no history shown.
      });
    return () => {
      cancelled = true;
    };
  }, [definitionId]);

  const runId =
    runParam ??
    (resolution.phase === "ready" ? resolution.runIdFromPath : null);

  // Probe a ?run= deep link before trusting it — a dead id fails fast with a
  // plain answer instead of a page that spins forever.
  useEffect(() => {
    setBadRunId(null);
    if (!runParam) return;
    let cancelled = false;
    fetchRunDefinitionId(runParam)
      .then((defId) => {
        if (!cancelled && defId === null) setBadRunId(runParam);
      })
      .catch(() => {
        if (!cancelled) setBadRunId(runParam);
      });
    return () => {
      cancelled = true;
    };
  }, [runParam]);

  const activeRunId = badRunId === runId ? null : runId;

  if (resolution.phase === "loading") {
    return (
      <Shell name="Workflow">
        <PageSkeleton />
      </Shell>
    );
  }

  if (resolution.phase === "missing") {
    return (
      <Shell name="Workflow">
        <EdgeCard
          title="This workflow couldn't be opened"
          detail={resolution.detail}
        />
      </Shell>
    );
  }

  return (
    <Shell name={resolution.name}>
      {badRunId ? (
        <EdgeCard
          title="That run couldn't be opened"
          detail="The run link is broken or points at a run you can't see. You can start a fresh run below."
          action={
            <Link
              href={`${BASE}/${resolution.definitionId}`}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
            >
              <Play className="h-4 w-4" aria-hidden />
              Set up a fresh run
            </Link>
          }
        />
      ) : activeRunId ? (
        <LiveRunBody
          runId={activeRunId}
          definitionId={resolution.definitionId}
          name={resolution.name}
          definition={resolution.definition}
        />
      ) : (
        <IntakeBody
          definitionId={resolution.definitionId}
          name={resolution.name}
          definition={resolution.definition}
          recentRuns={recentRuns}
          onOpened={(newRunId) =>
            router.replace(
              `${BASE}/${resolution.definitionId}?run=${newRunId}`,
            )
          }
        />
      )}
    </Shell>
  );
}

// ── Shared chrome ──────────────────────────────────────────────────────────

function Shell({ name, children }: { name: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <div className="h-full overflow-hidden">
      <RouteHeader
        left={
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => router.back()}
              aria-label="Back"
              className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
            </button>
            <span className="max-w-[40vw] truncate text-sm font-semibold">
              {name}
            </span>
          </div>
        }
      />
      <div
        className="h-full overflow-y-auto scrollbar-thin"
        style={{ paddingTop: "var(--shell-header-h)" }}
      >
        <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-4">
          {children}
        </div>
      </div>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy>
      <div className="h-16 animate-pulse rounded-xl bg-muted" />
      <div className="grid gap-4 lg:grid-cols-[minmax(260px,320px)_1fr]">
        <div className="h-72 animate-pulse rounded-xl bg-muted" />
        <div className="h-72 animate-pulse rounded-xl bg-muted" />
      </div>
    </div>
  );
}

function EdgeCard({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mx-auto mt-10 flex max-w-md flex-col items-center gap-3 rounded-xl border border-border bg-card p-8 text-center">
      <SearchX className="h-8 w-8 text-muted-foreground" aria-hidden />
      <h1 className="text-base font-semibold text-foreground">{title}</h1>
      <p className="text-sm text-muted-foreground">{detail}</p>
      {action}
    </div>
  );
}

// ── The promise strip (shared by intake and live) ──────────────────────────

function PromiseStrip({
  definition,
  runId,
  onAim,
}: {
  definition: WorkflowDefinitionLike;
  runId: string | null;
  onAim?: (nodeId: string) => void;
}) {
  const steps = useMemo(() => describeWorkflowSteps(definition), [definition]);
  const deliverables = useMemo(() => deliverableSteps(steps), [steps]);
  const phases = useAppSelector(selectNodeAggregatePhases(runId ?? "∅"));
  const status = useAppSelector(selectRunStatus(runId ?? "∅"));
  const startedAt = useAppSelector(selectRunStartedAt(runId ?? "∅"));
  const statusTs = useAppSelector(selectRunStatusTs(runId ?? "∅"));
  const cost = useAppSelector(selectRunCostTotal(runId ?? "∅"));
  const summary = planSummary(steps, phases);
  const runOver = runIsOver(status);

  return (
    <section
      aria-label="The promise"
      className="rounded-xl border border-border bg-card px-4 py-3"
    >
      <div className="flex min-h-8 flex-wrap items-center gap-x-4 gap-y-1.5">
        {runId ? (
          <RunStatusChip status={status ?? "pending"} />
        ) : (
          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            Ready to run
          </span>
        )}
        <span className="flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
          <Clock className="h-3.5 w-3.5" aria-hidden />
          {runId && startedAt ? (
            <ElapsedTime
              startedAt={startedAt}
              running={!runOver}
              endedAt={runOver ? statusTs : null}
            />
          ) : (
            "0:00"
          )}
        </span>
        {cost > 0 ? (
          <span className="flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
            <CircleDollarSign className="h-3.5 w-3.5" aria-hidden />
            ${cost.toFixed(2)}
          </span>
        ) : null}
        <span className="text-xs tabular-nums text-muted-foreground">
          {summary.done} of {summary.total} steps done
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          You&apos;ll get
        </span>
        {deliverables.length === 0 ? (
          <span className="text-xs text-muted-foreground">
            whatever this workflow shares on screen as it works
          </span>
        ) : (
          deliverables.map((step) => {
            const phase = phases[step.nodeId] ?? "idle";
            const done = phase === "settled";
            return (
              <button
                key={step.nodeId}
                type="button"
                onClick={onAim ? () => onAim(step.nodeId) : undefined}
                disabled={!onAim}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
                  done
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    : "border-dashed border-border text-muted-foreground",
                  onAim && "hover:bg-muted",
                )}
              >
                {humanizeKind(step.outputKind ?? "")}
                {done ? (
                  <Check className="ml-1 inline h-3 w-3" aria-label="Delivered" />
                ) : null}
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}

// ── Intake ─────────────────────────────────────────────────────────────────

function IntakeBody({
  definitionId,
  name,
  definition,
  recentRuns,
  onOpened,
}: {
  definitionId: string;
  name: string;
  definition: WorkflowDefinitionLike;
  recentRuns: RecentRunSummary[];
  onOpened: (runId: string) => void;
}) {
  const controls = useWorkflowRunControls();
  const steps = useMemo(() => describeWorkflowSteps(definition), [definition]);
  const sections = useMemo(() => deriveRunForm(definition), [definition]);

  return (
    <div className="space-y-4">
      <PromiseStrip definition={definition} runId={null} />
      <div className="grid gap-4 lg:grid-cols-[minmax(260px,320px)_1fr]">
        <aside className="rounded-xl border border-border bg-card p-2.5">
          <h2 className="px-2 pb-1.5 pt-1 text-xs font-semibold text-foreground">
            The plan · {steps.length} steps
          </h2>
          <PlanRail
            steps={steps}
            phases={{}}
            focusedNodeId={null}
            onAim={() => {}}
          />
        </aside>
        <div>
          <IntakeCard
            workflowName={name}
            sections={sections}
            recentRuns={recentRuns}
            starting={controls.starting}
            onStart={(nodeInputs) => {
              void controls
                .startRun({ definitionId, nodeInputs })
                .then((newRunId) => {
                  if (newRunId) onOpened(newRunId);
                });
            }}
            onOpenRun={onOpened}
          />
        </div>
      </div>
    </div>
  );
}

// ── The live run ───────────────────────────────────────────────────────────

function LiveRunBody({
  runId,
  definitionId,
  name,
  definition,
}: {
  runId: string;
  definitionId: string;
  name: string;
  definition: WorkflowDefinitionLike;
}) {
  const { ensureLane } = useWorkflowRun(runId);
  const controls = useWorkflowRunControls();
  const steps = useMemo(() => describeWorkflowSteps(definition), [definition]);
  const deliverables = useMemo(() => deliverableSteps(steps), [steps]);
  const stepLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const step of steps) map[step.nodeId] = step.label;
    return map;
  }, [steps]);

  const phases = useAppSelector(selectNodeAggregatePhases(runId));
  const status = useAppSelector(selectRunStatus(runId));
  const runOver = runIsOver(status);

  const [aimedNodeId, setAimedNodeId] = useState<string | null>(null);
  const followTarget = pickFollowTarget(steps, phases);
  const focusNodeId = aimedNodeId ?? followTarget;
  const focusStep = steps.find((step) => step.nodeId === focusNodeId) ?? null;

  return (
    <div className="space-y-4">
      <PromiseStrip
        definition={definition}
        runId={runId}
        onAim={(nodeId) => setAimedNodeId(nodeId)}
      />

      {/* Lifecycle + trouble — reserved slots that render null on the happy
          path; a run that needs a person SCREAMS here, above the fold. */}
      <InterruptCard runId={runId} />
      <RunErrorCard runId={runId} nodeLabels={stepLabels} />
      {runOver && (status === "failed" || status === "errored") ? (
        <div>
          <Link
            href={`${BASE}/${definitionId}`}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-muted"
          >
            <Play className="h-4 w-4" aria-hidden />
            Run “{name}” again
          </Link>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(260px,320px)_1fr]">
        <aside className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-2.5">
            <div className="flex items-center justify-between px-2 pb-1.5 pt-1">
              <h2 className="text-xs font-semibold text-foreground">
                The plan · {steps.length} steps
              </h2>
              <RunControls runId={runId} status={status} controls={controls} />
            </div>
            <PlanRail
              steps={steps}
              phases={phases}
              focusedNodeId={focusNodeId}
              onAim={(nodeId) => setAimedNodeId(nodeId)}
            />
          </div>
        </aside>

        <div className="min-w-0 space-y-4">
          {focusStep ? (
            <FocusPanel
              runId={runId}
              step={focusStep}
              following={aimedNodeId === null}
              onFollowLive={() => setAimedNodeId(null)}
              ensureLane={ensureLane}
            />
          ) : null}
          <ActivityFeed runId={runId} stepLabels={stepLabels} />
          <DeliveredSection
            runId={runId}
            deliverables={deliverables}
            runOver={runOver}
          />
        </div>
      </div>
    </div>
  );
}

function RunControls({
  runId,
  status,
  controls,
}: {
  runId: string;
  status: WorkflowRunStatus | null;
  controls: ReturnType<typeof useWorkflowRunControls>;
}) {
  const [busy, setBusy] = useState(false);
  if (runIsOver(status)) return null;

  const act = (fn: () => Promise<boolean>) => {
    setBusy(true);
    void fn().finally(() => setBusy(false));
  };

  return (
    <span className="flex items-center gap-1">
      {status === "running" ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => act(() => controls.pause(runId))}
          aria-label="Pause the run"
          className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted disabled:opacity-50"
        >
          <Pause className="h-3.5 w-3.5" aria-hidden />
        </button>
      ) : null}
      {status === "paused" ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => act(() => controls.resumePaused(runId))}
          aria-label="Resume the run"
          className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted disabled:opacity-50"
        >
          <Play className="h-3.5 w-3.5" aria-hidden />
        </button>
      ) : null}
      <button
        type="button"
        disabled={busy}
        onClick={() =>
          act(async () => {
            const sure = await confirm({
              title: "Stop this run?",
              description:
                "It will finish the step it's on, then stop. Anything already delivered stays yours.",
              confirmLabel: "Stop the run",
              variant: "destructive",
            });
            if (!sure) return false;
            const ok = await controls.cancel(runId, "graceful");
            if (ok) toast.info("Stopping — it will wind down gracefully.");
            return ok;
          })
        }
        aria-label="Stop the run"
        className="flex h-7 w-7 items-center justify-center rounded-md text-destructive hover:bg-destructive/10 disabled:opacity-50"
      >
        <OctagonX className="h-3.5 w-3.5" aria-hidden />
      </button>
    </span>
  );
}
