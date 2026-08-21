"use client";

/**
 * SharpRunPage — the ui-sharp wave-2 bake-off take on the auto-generated
 * workflow run page. Reference model: a premium order-tracking page (the
 * Apple order status page's promise → progress → delivered thread) with
 * Linear's calm density.
 *
 * One fixed shape, established before the first event, that only fills in:
 *
 *   [ header: name · status · clock · controls ]
 *   [ promise strip: everything you'll get, from frame zero ]
 *   [ the plan (folding) | the focus window | what's happening ]
 *   [ … the focus column continues into What you get (promises → artifacts) ]
 *
 * The presentation is new; the DATA layer is entirely canonical: adoption via
 * useWorkflowRun, selectors, InvocationBody / InterruptCard / RunErrorCard,
 * DbEmitRenderer, RunFormFieldControl, activity-copy. Only the focused step
 * is promoted to a streaming lane (the 12-lane budget); everything else rides
 * the tracked tier.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSelector } from "@reduxjs/toolkit";
import { CircleSlash, Loader2, OctagonX, Pause, Play, RotateCcw } from "lucide-react";

import { useAppSelector } from "@/lib/redux/hooks";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import ElapsedTime from "@/components/official-candidate/elapsed-time/ElapsedTime";

import {
  fetchRunDefinitionId,
  fetchWorkflowDefinition,
} from "../../surface/service";
import { deriveRunForm } from "../../surface/run-form";
import { useWorkflowRun } from "../../hooks/useWorkflowRun";
import { useWorkflowRunControls } from "../../hooks/useWorkflowRunControls";
import {
  selectNodeAggregate,
  selectNodeAggregatePhases,
  selectRunCostTotal,
  selectRunInterrupt,
  selectRunStartedAt,
  selectRunState,
  selectRunStatus,
  selectRunStatusTs,
} from "../../redux/workflow-runs.selectors";
import { TERMINAL_RUN_STATUSES } from "../../types";
import { RunStatusChip } from "../../run-status";
import { RunOutcomeBanner } from "./RunOutcomeBanner";
import {
  deliverableSteps,
  describeWorkflowSteps,
  stepsByNodeId,
  type RunStepPresentation,
} from "../../components/run/node-presentation";
import type { WorkflowDefinitionLike } from "../../trigger-points";

import { freshestNodeId } from "./plan-model";
import { PlanColumn } from "./PlanColumn";
import { FocusPanel } from "./FocusPanel";
import { ActivityRail } from "./ActivityRail";
import { Delivered, PromiseStrip } from "./Delivered";
import { Intake } from "./Intake";

type Loaded =
  | { state: "loading" }
  | { state: "missing" }
  | { state: "error"; message: string }
  | {
      state: "ready";
      definitionId: string;
      name: string;
      definition: WorkflowDefinitionLike;
      /** Set when the [id] in the URL was actually a run id. */
      runIdFromPath: string | null;
    };

/** nodeId → summed settled duration ms, for the plan's per-step clocks. */
const makeSelectDurations = (runId: string) =>
  createSelector([selectRunState(runId)], (run): Record<string, number> => {
    const out: Record<string, number> = {};
    if (!run) return out;
    for (const invocation of Object.values(run.nodes)) {
      if (invocation.durationMs !== null && invocation.durationMs > 0) {
        out[invocation.nodeId] =
          (out[invocation.nodeId] ?? 0) + invocation.durationMs;
      }
    }
    return out;
  });

export default function SharpRunPage({ id }: { id: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });

  // Probe, don't spin: the id is a definition id, else a run id, else a plain
  // honest answer. An access refusal / network failure is its own answer.
  useEffect(() => {
    let cancelled = false;
    // An id that is not even UUID-shaped can never resolve — Postgres refuses
    // the cast (22P02) and the read THROWS. Reporting that as "try again in a
    // moment" would promise a retry that can never succeed, so a malformed
    // link is answered as what it is: nothing at this address.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      setLoaded({ state: "missing" });
      return;
    }
    (async () => {
      try {
        const asDefinition = await fetchWorkflowDefinition(id);
        if (asDefinition) {
          if (!cancelled) {
            setLoaded({
              state: "ready",
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
          if (!cancelled) {
            if (viaRun) {
              setLoaded({
                state: "ready",
                definitionId: viaRun.id,
                name: viaRun.name,
                definition: viaRun.definition,
                runIdFromPath: id,
              });
            } else {
              setLoaded({ state: "missing" });
            }
          }
          return;
        }
        if (!cancelled) setLoaded({ state: "missing" });
      } catch {
        if (!cancelled) {
          setLoaded({
            state: "error",
            message:
              "We couldn't reach this workflow right now. It may not be shared with you, or the connection failed — try again in a moment.",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const runParam = searchParams.get("run");
  const runId =
    loaded.state === "ready" ? (loaded.runIdFromPath ?? runParam) : null;

  if (loaded.state === "loading") {
    return (
      <Shell title="Workflow">
        <div className="flex h-full items-center justify-center">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Opening the workflow…
          </div>
        </div>
      </Shell>
    );
  }

  if (loaded.state === "missing" || loaded.state === "error") {
    return (
      <Shell title="Workflow">
        <div className="flex h-full items-center justify-center p-4">
          <div className="max-w-md rounded-xl border border-border bg-card p-5 text-center">
            <CircleSlash className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium text-foreground">
              {loaded.state === "missing"
                ? "There's nothing at this address"
                : "We couldn't open this"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {loaded.state === "missing"
                ? "This link doesn't match any workflow or run you can see. It may have been removed, or the link was copied incompletely."
                : loaded.message}
            </p>
            <button
              type="button"
              onClick={() => router.back()}
              className="mt-3 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
            >
              Go back
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <ReadyPage
      key={`${loaded.definitionId}:${runId ?? "intake"}`}
      loaded={loaded}
      runId={runId}
    />
  );
}

function Shell({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <>
      <RouteHeader
        left={
          <div className="flex min-w-0 items-center">
            <ChevronLeftTapButton
              onClick={() => router.back()}
              variant="transparent"
              ariaLabel="Back"
            />
            <h1 className="ml-1 min-w-0 truncate text-sm font-medium text-foreground">
              {title}
            </h1>
          </div>
        }
        right={right}
      />
      <div className="h-full overflow-hidden bg-textured pt-[var(--shell-header-h)]">
        {children}
      </div>
    </>
  );
}

function ReadyPage({
  loaded,
  runId,
}: {
  loaded: Extract<Loaded, { state: "ready" }>;
  runId: string | null;
}) {
  const router = useRouter();
  const steps = useMemo(
    () => describeWorkflowSteps(loaded.definition),
    [loaded.definition],
  );
  const byNodeId = useMemo(() => stepsByNodeId(steps), [steps]);
  const deliverables = useMemo(() => deliverableSteps(steps), [steps]);
  const stepLabels = useMemo(() => {
    const out: Record<string, string> = {};
    for (const step of steps) out[step.nodeId] = step.label;
    return out;
  }, [steps]);
  const sections = useMemo(
    () => deriveRunForm(loaded.definition),
    [loaded.definition],
  );

  const { ensureLane } = useWorkflowRun(runId);
  const controls = useWorkflowRunControls();

  const phases = useAppSelector(selectNodeAggregatePhases(runId ?? "__none__"));
  const status = useAppSelector(selectRunStatus(runId ?? "__none__"));
  const startedAt = useAppSelector(selectRunStartedAt(runId ?? "__none__"));
  const statusTs = useAppSelector(selectRunStatusTs(runId ?? "__none__"));
  const cost = useAppSelector(selectRunCostTotal(runId ?? "__none__"));
  const interrupt = useAppSelector(selectRunInterrupt(runId ?? "__none__"));
  const durations = useAppSelector(
    makeSelectDurations(runId ?? "__none__"),
  );

  const runOver = status !== null && TERMINAL_RUN_STATUSES.has(status);
  const running = runId !== null && !runOver;

  // ── One aimed focus ─────────────────────────────────────────────────────
  // aim === null means "follow the freshest work". A waiting question always
  // wins while following — the page should be looking at what needs YOU.
  const [aim, setAim] = useState<string | null>(null);
  const order = steps.map((step) => step.nodeId);
  const followed =
    interrupt && byNodeId[interrupt.nodeId]
      ? interrupt.nodeId
      : freshestNodeId(order, phases);
  const focusNodeId = aim ?? followed;
  const focusStep: RunStepPresentation | null = focusNodeId
    ? (byNodeId[focusNodeId] ?? null)
    : null;
  const focusIndex = focusNodeId ? order.indexOf(focusNodeId) : -1;

  // ── The streaming budget, honored ───────────────────────────────────────
  // Only the focused step's single-target invocation gets a lane (fan-out
  // stays tracked-tier by invariant). Seeded with the tail so promotion keeps
  // the visible history.
  const focusAggregate = useAppSelector(
    selectNodeAggregate(runId ?? "__none__", focusNodeId ?? "__none__"),
  );
  const focusInvocation =
    focusAggregate.invocations.length === 1 &&
    focusAggregate.expectedCount <= 1
      ? focusAggregate.invocations[0]
      : null;
  const wantsLane =
    runId !== null &&
    focusInvocation !== null &&
    (focusInvocation.phase === "running" ||
      focusInvocation.phase === "retrying") &&
    focusInvocation.laneRequestId === null;
  useEffect(() => {
    if (!wantsLane || !runId || !focusInvocation) return;
    ensureLane(
      runId,
      focusInvocation.invocationKey,
      focusInvocation.textTail || undefined,
    );
  }, [wantsLane, runId, focusInvocation, ensureLane]);

  const startRun = async (
    nodeInputs: Record<string, Record<string, unknown>>,
  ) => {
    const newRunId = await controls.startRun({
      definitionId: loaded.definitionId,
      nodeInputs,
    });
    if (newRunId) {
      router.replace(
        `/workflows/bakeoff/sharp-2/${loaded.definitionId}?run=${newRunId}`,
      );
    }
  };

  const headerRight = runId ? (
    <div className="flex items-center gap-2">
      <ElapsedTime
        startedAt={startedAt}
        running={running}
        endedAt={runOver ? statusTs : null}
        className="font-mono text-xs tabular-nums text-muted-foreground"
      />
      <RunStatusChip status={status} />
      {status === "running" ? (
        <HeaderAction
          label="Pause"
          icon={Pause}
          onClick={() => void controls.pause(runId)}
        />
      ) : null}
      {status === "paused" ? (
        <HeaderAction
          label="Resume"
          icon={Play}
          onClick={() => void controls.resumePaused(runId)}
        />
      ) : null}
      {running && status !== "cancelling" ? (
        <HeaderAction
          label="Stop"
          icon={OctagonX}
          destructive
          onClick={() => void controls.cancel(runId)}
        />
      ) : null}
      {runOver ? (
        <HeaderAction
          label="Run again"
          icon={RotateCcw}
          onClick={() =>
            router.push(`/workflows/bakeoff/sharp-2/${loaded.definitionId}`)
          }
        />
      ) : null}
    </div>
  ) : undefined;

  return (
    <Shell title={loaded.name} right={headerRight}>
      <div className="flex h-full min-h-0 flex-col">
        {/* The promise strip — fixed row, present from frame zero. */}
        <div className="flex h-11 shrink-0 items-center gap-3 border-b border-border/60 px-3">
          <PromiseStrip
            deliverables={deliverables}
            phases={phases}
            runOver={runOver}
          />
          {deliverables.length === 0 ? (
            <span className="text-[11px] text-muted-foreground">
              This workflow shows its work as it goes.
            </span>
          ) : null}
          {runId && cost > 0 ? (
            <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
              ${cost.toFixed(2)}
            </span>
          ) : null}
        </div>

        {/* The three fixed regions. Desktop: independent scrolls, zero shift.
            Mobile: one stack, one scroll. */}
        <div className="min-h-0 flex-1 overflow-y-auto p-3 lg:grid lg:grid-cols-[280px_minmax(0,1fr)_320px] lg:gap-3 lg:overflow-hidden scrollbar-thin">
          <aside className="mb-3 lg:mb-0 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:pr-1 scrollbar-thin">
            <h2 className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              The plan
            </h2>
            <PlanColumn
              steps={steps}
              byNodeId={byNodeId}
              phases={phases}
              durations={durations}
              focusNodeId={runId ? focusNodeId : null}
              onAim={(nodeId) => setAim(nodeId === followed ? null : nodeId)}
            />
          </aside>

          <main className="mb-3 space-y-3 lg:mb-0 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:pr-1 scrollbar-thin">
            {steps.length === 0 ? (
              <div className="rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground">
                This workflow has no steps yet, so there is nothing to run.
                Someone needs to finish building it first.
              </div>
            ) : runId ? (
              <>
                <FocusPanel
                  runId={runId}
                  step={focusStep}
                  stepIndex={focusIndex}
                  stepCount={steps.length}
                  following={aim === null}
                  onFollowLive={() => setAim(null)}
                />
                <RunOutcomeBanner
                  runId={runId}
                  stepLabels={stepLabels}
                  deliverables={deliverables}
                  phases={phases}
                  focusNodeId={focusNodeId}
                />
                <Delivered
                  runId={runId}
                  deliverables={deliverables}
                  runOver={runOver}
                />
              </>
            ) : (
              <Intake
                workflowName={loaded.name}
                sections={sections}
                deliverableCount={deliverables.length}
                stepCount={steps.length}
                starting={controls.starting}
                onStart={(nodeInputs) => void startRun(nodeInputs)}
              />
            )}
          </main>

          <aside className="lg:h-full lg:min-h-0">
            {runId ? (
              <div className="h-64 lg:h-full">
                <ActivityRail runId={runId} stepLabels={stepLabels} />
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
                Once you start, this column narrates the run — every tool it
                uses, every step finishing, in plain words.
              </div>
            )}
          </aside>
        </div>
      </div>
    </Shell>
  );
}

function HeaderAction({
  label,
  icon: Icon,
  onClick,
  destructive,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        destructive
          ? "flex items-center gap-1 rounded-full border border-destructive/40 px-2.5 py-1 text-[11px] font-medium text-destructive hover:bg-destructive/10"
          : "flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-muted"
      }
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}
