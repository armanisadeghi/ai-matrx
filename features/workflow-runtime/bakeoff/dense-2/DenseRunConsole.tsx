"use client";

/**
 * DenseRunConsole — ui-dense wave-2 bake-off: the auto-generated workflow run
 * page as an operations desk.
 *
 * Declared geometry: three fixed panes (plan ledger | aimed focus | activity
 * rail) plus a thin facts strip and a promises strip, all present before the
 * first event — placeholders become content, nothing ever pushes anything
 * around. Intake lives in the center pane; the live run and the delivered
 * result live in the SAME panes, so the page keeps one continuous thread from
 * "you will get X" to "here is X".
 *
 * Data is 100% the canonical layer: useWorkflowRun adoption, workflowRuns
 * selectors, InvocationBody / DbEmitRenderer rendering, useWorkflowRunControls
 * verbs. Only the focused step streams (the 12-lane budget, spent one at a
 * time).
 */

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { OctagonX, Pause, Play, RotateCcw } from "lucide-react";

import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { useIsMobile } from "@/hooks/use-mobile";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import IconResolver from "@/components/official/icons/IconResolver";
import { ElapsedTime } from "@/components/official-candidate/elapsed-time/ElapsedTime";
import { CardLoading } from "@/components/matrx/LoadingComponents";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { pct } from "@/components/matrx/resizable/pct";

import {
  InterruptCard,
  PhaseIcon,
  RunErrorCard,
} from "../../components/readout-parts";
import { RunStatusChip } from "../../run-status";
import {
  describeWorkflowSteps,
  deliverableSteps,
  humanizeKind,
  FAMILY_ICON,
  type RunStepPresentation,
} from "../../components/run/node-presentation";
import {
  selectRunCostTotal,
  selectRunStartedAt,
  selectRunState,
  selectRunStatus,
  selectRunStatusTs,
} from "../../redux/workflow-runs.selectors";
import { TERMINAL_RUN_STATUSES } from "../../types";
import {
  fetchRunDefinitionId,
  fetchWorkflowDefinition,
} from "../../surface/service";
import { useWorkflowRun } from "../../hooks/useWorkflowRun";
import { useWorkflowRunControls } from "../../hooks/useWorkflowRunControls";
import type { WorkflowDefinitionLike } from "../../trigger-points";

import { deriveLedgerRows, freshestNodeId, type LedgerRow } from "./model";
import { PlanLedger } from "./PlanLedger";
import { FocusPane } from "./FocusPane";
import { ActivityRail } from "./ActivityRail";
import { IntakePanel } from "./IntakePanel";

type DefinitionLoad =
  | { state: "loading" }
  | { state: "missing" }
  | { state: "error" }
  | {
      state: "ready";
      name: string;
      definition: WorkflowDefinitionLike;
    };

export function DenseRunConsole({ definitionId }: { definitionId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const runId = searchParams.get("run");
  const isMobile = useIsMobile();

  // ── Definition — probe, don't spin ─────────────────────────────────────
  const [load, setLoad] = useState<DefinitionLoad>({ state: "loading" });
  useEffect(() => {
    let cancelled = false;
    setLoad({ state: "loading" });
    fetchWorkflowDefinition(definitionId)
      .then((row) => {
        if (cancelled) return;
        setLoad(
          row
            ? { state: "ready", name: row.name, definition: row.definition }
            : { state: "missing" },
        );
      })
      .catch(() => {
        if (!cancelled) setLoad({ state: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [definitionId]);

  // ── Run probe — a bad ?run= fails fast with a plain answer ─────────────
  const [runProbe, setRunProbe] = useState<"ok" | "checking" | "missing">("ok");
  useEffect(() => {
    if (!runId) {
      setRunProbe("ok");
      return;
    }
    let cancelled = false;
    setRunProbe("checking");
    fetchRunDefinitionId(runId)
      .then((defId) => {
        if (!cancelled) setRunProbe(defId ? "ok" : "missing");
      })
      .catch(() => {
        if (!cancelled) setRunProbe("missing");
      });
    return () => {
      cancelled = true;
    };
  }, [runId]);

  const adoptedRunId = runProbe === "ok" ? runId : null;
  const { ensureLane } = useWorkflowRun(adoptedRunId);

  const openRun = (id: string) => {
    router.replace(`${pathname}?run=${id}`);
  };
  const clearRun = () => {
    router.replace(pathname);
  };

  const title = load.state === "ready" ? load.name : "Workflow";

  return (
    <>
      <RouteHeader
        left={
          <>
            <ChevronLeftTapButton
              onClick={() => router.back()}
              variant="transparent"
              ariaLabel="Back"
            />
            <span className="ml-1 min-w-0 truncate text-sm font-medium text-foreground">
              {title}
            </span>
          </>
        }
      />
      <div className="h-full overflow-hidden bg-textured">
        <div
          className="flex h-full min-h-0 flex-col"
          style={{ paddingTop: "var(--shell-header-h)" }}
        >
          {load.state === "loading" ? (
            <div className="p-4">
              <CardLoading />
            </div>
          ) : load.state !== "ready" ? (
            <EdgeCard
              headline={
                load.state === "missing"
                  ? "This workflow doesn't exist, or you don't have access to it."
                  : "We couldn't open this workflow right now."
              }
              actionLabel="See all workflows"
              onAction={() => router.push("/workflows/all")}
            />
          ) : runId && runProbe === "missing" ? (
            <EdgeCard
              headline="This run doesn't exist, or you don't have access to it."
              actionLabel="Set up a new run"
              onAction={clearRun}
            />
          ) : (
            <Desk
              definitionId={definitionId}
              definition={load.definition}
              runId={adoptedRunId}
              probing={runId !== null && runProbe === "checking"}
              isMobile={isMobile}
              ensureLane={ensureLane}
              onStarted={openRun}
              onOpenRun={openRun}
              onNewRun={clearRun}
            />
          )}
        </div>
      </div>
    </>
  );
}

function EdgeCard({
  headline,
  actionLabel,
  onAction,
}: {
  headline: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="flex flex-1 items-start justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-4">
        <p className="text-sm text-foreground">{headline}</p>
        <button
          type="button"
          onClick={onAction}
          className="mt-3 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
}

// ── The desk itself ──────────────────────────────────────────────────────

function Desk({
  definitionId,
  definition,
  runId,
  probing,
  isMobile,
  ensureLane,
  onStarted,
  onOpenRun,
  onNewRun,
}: {
  definitionId: string;
  definition: WorkflowDefinitionLike;
  runId: string | null;
  probing: boolean;
  isMobile: boolean;
  ensureLane: ReturnType<typeof useWorkflowRun>["ensureLane"];
  onStarted: (runId: string) => void;
  onOpenRun: (runId: string) => void;
  onNewRun: () => void;
}) {
  const steps = describeWorkflowSteps(definition);
  const deliverables = deliverableSteps(steps);
  const stepLabels: Record<string, string> = {};
  for (const step of steps) stepLabels[step.nodeId] = step.label;

  const selectorRunId = runId ?? "";
  const runState = useAppSelector(selectRunState(selectorRunId));
  const status = useAppSelector(selectRunStatus(selectorRunId));
  const startedAt = useAppSelector(selectRunStartedAt(selectorRunId));
  const statusTs = useAppSelector(selectRunStatusTs(selectorRunId));
  const cost = useAppSelector(selectRunCostTotal(selectorRunId));
  const { pause, resumePaused, cancel } = useWorkflowRunControls();

  // `errored` is not in TERMINAL_RUN_STATUSES, but for THIS page's clock and
  // controls it is over: the engine won't advance it, so a ticking elapsed
  // time and a Stop button would both be lies.
  const runOver =
    status !== null &&
    (TERMINAL_RUN_STATUSES.has(status) || status === "errored");
  const rows = deriveLedgerRows(steps, runState);
  const doneCount = rows.filter(
    (r) => r.phase === "settled" || r.phase === "skipped",
  ).length;

  // One aimed focus: auto-follow the freshest work; a manual aim sticks until
  // "Back to the action". Everything else is tracked, never streamed.
  const [manualAim, setManualAim] = useState<string | null>(null);
  const followed = freshestNodeId(rows, runOver);
  const following = manualAim === null;
  const aimedNodeId =
    manualAim ?? followed ?? (steps.length > 0 ? steps[0].nodeId : null);
  const aimedRow = rows.find((r) => r.step.nodeId === aimedNodeId) ?? null;

  const stop = async () => {
    if (!runId) return;
    const ok = await confirm({
      title: "Stop this run?",
      description:
        "It finishes what it's doing and stops. Anything already delivered stays.",
      confirmLabel: "Stop the run",
      variant: "destructive",
    });
    if (ok) void cancel(runId, "graceful");
  };

  const running = status === "running" || status === "pending";

  const factsStrip = (
    <div className="flex h-9 shrink-0 items-center gap-2 overflow-x-auto border-b border-border px-2.5 scrollbar-hide">
      {runId ? (
        <>
          <RunStatusChip status={probing ? null : status} />
          <ElapsedTime
            startedAt={startedAt}
            running={!runOver}
            endedAt={runOver ? statusTs : null}
            className="text-xs tabular-nums text-foreground"
          />
          <span className="text-xs tabular-nums text-muted-foreground">
            {doneCount}/{rows.length} steps
          </span>
          {cost > 0 ? (
            <span className="text-xs tabular-nums text-muted-foreground">
              ${cost.toFixed(2)}
            </span>
          ) : null}
          <span className="flex-1" />
          {status === "paused" ? (
            <StripButton
              icon={<Play className="h-3.5 w-3.5" />}
              label="Resume"
              onClick={() => void resumePaused(runId)}
            />
          ) : running ? (
            <StripButton
              icon={<Pause className="h-3.5 w-3.5" />}
              label="Pause"
              onClick={() => void pause(runId)}
            />
          ) : null}
          {!runOver && status !== null ? (
            <StripButton
              icon={<OctagonX className="h-3.5 w-3.5 text-destructive" />}
              label="Stop"
              onClick={() => void stop()}
            />
          ) : null}
          {runOver ? (
            <StripButton
              icon={<RotateCcw className="h-3.5 w-3.5" />}
              label="Run it again"
              onClick={onNewRun}
            />
          ) : null}
        </>
      ) : (
        <span className="text-xs text-muted-foreground">
          Not started — fill in what it needs and press Start.
        </span>
      )}
    </div>
  );

  const promisesStrip =
    deliverables.length > 0 ? (
      <div className="flex h-9 shrink-0 items-center gap-1.5 overflow-x-auto border-b border-border px-2.5 scrollbar-hide">
        <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          You get
        </span>
        {deliverables.map((step) => (
          <PromiseChip
            key={step.nodeId}
            step={step}
            row={rows.find((r) => r.step.nodeId === step.nodeId) ?? null}
            aimed={step.nodeId === aimedNodeId}
            onAim={() => setManualAim(step.nodeId)}
          />
        ))}
      </div>
    ) : null;

  const center = runId ? (
    <div className="flex h-full min-h-0 flex-col">
      {/* Failure and questions are first-class — they sit above the focus,
          inside the pane, so the page's shape never changes. */}
      <RunAlerts runId={runId} nodeLabels={stepLabels} />
      <div className="min-h-0 flex-1">
        <FocusPane
          runId={runId}
          row={aimedRow}
          following={following}
          onFollow={() => setManualAim(null)}
          ensureLane={ensureLane}
        />
      </div>
    </div>
  ) : (
    <IntakePanel
      definitionId={definitionId}
      definition={definition}
      deliverables={deliverables}
      onStarted={onStarted}
      onOpenRun={onOpenRun}
    />
  );

  const plan = (
    <PlanLedger
      rows={rows}
      aimedNodeId={runId ? aimedNodeId : null}
      followedNodeId={followed}
      onAim={(nodeId) => setManualAim(nodeId)}
    />
  );

  const rail = runId ? (
    <ActivityRail
      runId={runId}
      stepLabels={stepLabels}
      onAim={(nodeId) => setManualAim(nodeId)}
    />
  ) : (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border px-2.5 py-1.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Activity
        </span>
      </div>
      <p className="px-2.5 py-3 text-xs text-muted-foreground">
        Once it starts, every tool call, phase and finish lands here as it
        happens.
      </p>
    </div>
  );

  if (isMobile) {
    return (
      <>
        {factsStrip}
        {promisesStrip}
        <div className="min-h-0 shrink-0 basis-[26dvh] overflow-hidden border-b border-border">
          {plan}
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">{center}</div>
        <MobileActivityDrawer>{rail}</MobileActivityDrawer>
      </>
    );
  }

  return (
    <>
      {factsStrip}
      {promisesStrip}
      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        <ResizablePanel
          defaultSize={pct(26)}
          minSize={pct(16)}
          maxSize={pct(40)}
          style={{ overflow: "hidden" }}
        >
          {plan}
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel
          defaultSize={pct(48)}
          minSize={pct(30)}
          style={{ overflow: "hidden" }}
        >
          {center}
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel
          defaultSize={pct(26)}
          minSize={pct(14)}
          maxSize={pct(36)}
          style={{ overflow: "hidden" }}
        >
          {rail}
        </ResizablePanel>
      </ResizablePanelGroup>
    </>
  );
}

function RunAlerts({
  runId,
  nodeLabels,
}: {
  runId: string;
  nodeLabels: Record<string, string>;
}) {
  return (
    <div className="shrink-0 empty:hidden [&>*]:m-2 [&>*]:mb-0">
      <RunErrorCard runId={runId} nodeLabels={nodeLabels} />
      <InterruptCard runId={runId} />
    </div>
  );
}

function StripButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-accent/50"
    >
      {icon}
      {label}
    </button>
  );
}

function PromiseChip({
  step,
  row,
  aimed,
  onAim,
}: {
  step: RunStepPresentation;
  row: LedgerRow | null;
  aimed: boolean;
  onAim: () => void;
}) {
  const phase = row?.phase ?? "idle";
  const ready = phase === "settled";
  return (
    <button
      type="button"
      onClick={onAim}
      className={cn(
        "flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none transition-colors",
        ready
          ? "border-emerald-500/20 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
          : phase === "running" || phase === "retrying"
            ? "border-blue-500/20 bg-blue-500/15 text-blue-600 dark:text-blue-400"
            : phase === "failed"
              ? "border-destructive/20 bg-destructive/15 text-destructive"
              : "border-border bg-muted text-muted-foreground",
        aimed && "ring-1 ring-primary/40",
      )}
    >
      <PhaseIcon phase={phase} />
      <IconResolver
        iconName={step.iconName ?? FAMILY_ICON[step.family]}
        className="h-3 w-3"
      />
      {humanizeKind(step.outputKind ?? step.label)}
    </button>
  );
}

function MobileActivityDrawer({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="shrink-0 border-t border-border pb-safe">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        Activity
        <span>{open ? "Hide" : "Show"}</span>
      </button>
      {open ? <div className="h-[30dvh] overflow-hidden">{children}</div> : null}
    </div>
  );
}
