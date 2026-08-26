"use client";

/**
 * ReadoutView — renders ONE readout's content inside a Run Surface grid
 * cell. The cell FRAME (border/bg/title row) is drawn by the host
 * (RunSurfaceView); everything here renders bare (the wrapper law).
 *
 * Source kinds:
 * - "node"        — the node's invocations via the shared InvocationBody,
 *                   honoring the author-chosen multi-run mode (R8).
 * - "group"       — mini status line per member + bodies for members with
 *                   lanes/output.
 * - "childRun"    — the linked child run rendered as its OWN compact Run
 *                   Surface when one exists (R9), else a compact summary with
 *                   an expandable full board.
 * - "progressRail"— ProgressRailReadout.
 * - "static"      — markdown via the canonical MarkdownStream (content mode).
 * - "action"      — Phase 4 stub: disabled button + readiness note.
 *
 * Viewer-driven lane promotion (the lane budget's other half): a node readout
 * that is ON SCREEN promotes its running, lane-less invocations to streaming
 * lanes via the adoption handle's `ensureLane` (threaded from the surface),
 * seeding the new lane with the tracked text tail so nothing visible is lost.
 * Off-screen readouts stay in the tracked tier.
 *
 * Rendering law compliance: all streamed/settled content flows through
 * InvocationBody (LiveRunDisplay / KindInstanceRender) or MarkdownStream —
 * nothing here parses a stream.
 *
 * NOTE: this module and RunSurfaceView import each other (a childRun readout
 * renders the child's compact surface). Both are hoisted function-declaration
 * components used only at render time, so the cycle is safe by construction —
 * never add a module-eval-time dependency between them.
 */

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { useAppSelector } from "@/lib/redux/hooks";
import MarkdownStream from "@/components/MarkdownStream";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";

import type { Readout, ReadoutSource, RunSurfaceConfig } from "../surface/config";
import { TERMINAL_RUN_STATUSES } from "../types";
import {
  getDefaultSurface,
  fetchWorkflowDefinition,
} from "../surface/service";
import {
  nodeActionReadiness,
  type NodeActionReadiness,
  type WorkflowDefinitionLike,
} from "../trigger-points";
import { useWorkflowRunControls } from "../hooks/useWorkflowRunControls";
import {
  selectChildRunIdForNode,
  selectNodeAggregate,
  selectNodeAggregatePhases,
  selectRunDefinitionId,
  selectRunStatus,
  selectRunStickyFacts,
} from "../redux/workflow-runs.selectors";
import type { NodeInvocationState } from "../redux/workflow-runs.slice";
import { InvocationBody, PhaseIcon, PHASE_LABEL } from "./readout-parts";
import { RUN_STATUS_LABEL, RUN_STATUS_PHASE } from "../run-status";
import { ProgressRailReadout } from "./ProgressRailReadout";
import { definitionNodeLabels, RunSurfaceView } from "./RunSurfaceView";
import { nodeOutputKind } from "./run/node-presentation";
import { KindSlot } from "@/features/content-ir/react/slot/KindSlot";
import { WorkflowRunBoard } from "./WorkflowRunBoard";

/** Promotion callback bound to the readout's run by the hosting surface. */
export type EnsureLaneFn = (
  invocationKey: string,
  seedText?: string,
) => string | null;

/** Author-defined marks are Phase 5+ — none fire from readouts. */
const EMPTY_MARKS: ReadonlySet<string> = new Set();

/**
 * Promote a visible node readout's running, lane-less invocations to
 * streaming lanes (IntersectionObserver on the returned host ref). Idempotent
 * and budget-refusal-safe: `ensureLane` returns the existing lane or null.
 */
function useViewportLanePromotion(
  invocations: readonly NodeInvocationState[],
  ensureLane: EnsureLaneFn | undefined,
) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);

  // The host div only mounts once invocations exist (the empty state renders
  // without it) — the observer effect must RE-RUN when that flips, or a
  // readout that first rendered before its node started never attaches an
  // observer and never promotes (adversarial finding 3).
  const hasHost = invocations.length > 0;
  useEffect(() => {
    const el = hostRef.current;
    if (!el || !ensureLane) return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) setInView(entry.isIntersecting);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ensureLane, hasHost]);

  useEffect(() => {
    if (!inView || !ensureLane) return;
    for (const inv of invocations) {
      if (inv.phase === "running" && inv.laneRequestId === null) {
        ensureLane(inv.invocationKey, inv.textTail || undefined);
      }
    }
  }, [inView, invocations, ensureLane]);

  return hostRef;
}

function invocationHasBody(inv: NodeInvocationState): boolean {
  return (
    inv.laneRequestId !== null ||
    inv.textTail.length > 0 ||
    inv.output !== null ||
    inv.error !== null
  );
}

/** One-line summary for the compact table mode — honest v1: the output kind
 * when declared, else the first 80 chars of the text tail / raw output. */
function invocationSummary(inv: NodeInvocationState): string {
  if (inv.outputKind) return inv.outputKind;
  const text =
    inv.textTail.length > 0
      ? inv.textTail
      : inv.output !== null
        ? JSON.stringify(inv.output)
        : inv.error?.message ?? "";
  if (!text) return PHASE_LABEL[inv.phase] ?? inv.phase;
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)}s`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

/** The real "table" multi-run mode: one canonical MatrxDataTable over the
 * invocations — every column sorts and filters, phases get real options. */
const INVOCATION_COLUMNS: MatrxColumnDef<NodeInvocationState>[] = [
  {
    id: "item",
    header: "Item",
    accessorFn: (inv) => inv.itemIndex + 1,
    cell: (inv) => (
      <span className="text-muted-foreground">
        {inv.itemIndex + 1}
        {inv.iteration !== null ? ` · pass ${inv.iteration + 1}` : ""}
      </span>
    ),
  },
  {
    id: "status",
    header: "Status",
    accessorFn: (inv) => PHASE_LABEL[inv.phase] ?? inv.phase,
    filter: "select",
    cell: (inv) => (
      <span className="flex items-center gap-1.5">
        <PhaseIcon phase={inv.phase} />
        {PHASE_LABEL[inv.phase] ?? inv.phase}
      </span>
    ),
  },
  {
    id: "output",
    header: "Output",
    accessorFn: (inv) => invocationSummary(inv),
    cell: (inv) => (
      <span className="block max-w-96 truncate">{invocationSummary(inv)}</span>
    ),
  },
  {
    id: "duration",
    header: "Duration",
    accessorFn: (inv) => inv.durationMs ?? 0,
    cell: (inv) => (
      <span className="text-muted-foreground">
        {formatDuration(inv.durationMs)}
      </span>
    ),
  },
];

function NodeReadout({
  runId,
  nodeId,
  multiRun,
  prefer,
  ensureLane,
  definition,
}: {
  runId: string;
  nodeId: string;
  multiRun: "stack" | "latest" | "table";
  prefer: "live" | "persisted";
  ensureLane?: EnsureLaneFn;
  /** Read for the node's declared `output_kind` — what shape to reserve. */
  definition?: WorkflowDefinitionLike;
}) {
  const aggregate = useAppSelector(selectNodeAggregate(runId, nodeId));
  const runStatus = useAppSelector(selectRunStatus(runId));
  const terminal = runStatus !== null && TERMINAL_RUN_STATUSES.has(runStatus);
  const { invocations, phase } = aggregate;
  // The step's promised shape, from the DEFINITION — threaded to every
  // InvocationBody so a bare-JSON stream shows this kind's arriving
  // silhouette instead of raw text.
  const declaredKind = nodeOutputKind(definition, nodeId);
  // Promotion is SINGLE-invocation only: fan-out deltas carry node_id alone
  // and stay in the tracked tier, so a promoted sibling lane could never
  // receive content — a blank pane shadowing the tail (same defect class the
  // fan-out routing fix removed). Guard mirrors the adapter's isFanOut test.
  const canPromote =
    invocations.length <= 1 && aggregate.expectedCount <= 1
      ? ensureLane
      : undefined;
  const hostRef = useViewportLanePromotion(invocations, canPromote);

  if (invocations.length === 0) {
    // No invocations → nothing to promote, so no observer host needed. The
    // copy is forward-looking, not a status stamp: on the first frame of a
    // run every box said "Not started", which reads as a failure report
    // rather than as the queue it actually is.
    //
    // On a TERMINAL run there is no future to point at, and the forward-
    // looking sentence becomes a lie the reader waits on: the finished Study
    // Pack run showed "This fills in when the run reaches this step" under
    // "Study notes" forever, because that one node of 24 never ran
    // (2026-08-18). A finished run says so.
    const waiting = phase === "idle" || phase === "waiting";
    // A step that has not started yet RESERVES the shape it will produce,
    // when its definition declares one. A single line of grey text reserved
    // nothing, so the surface lurched the moment any step settled — the
    // reader's page jumping by whatever height a flashcard set or a deck
    // happened to need. Still and quiet: nothing has started.
    //
    // A TERMINAL run reserves nothing: there is no future to hold space for,
    // and "This step never ran." is the final, honest answer.
    //
    // `errored` is not in TERMINAL_RUN_STATUSES but the run is over all the
    // same, and three sibling consoles already treat it that way. Reserving
    // there left a mute, breathing skeleton on screen forever — `bare` skips
    // the header that would have said "Coming up", and the host tile is in
    // content mode, so nothing on screen explained itself.
    const over = terminal || runStatus === "errored";
    const reservedKind = waiting && !over ? nodeOutputKind(definition, nodeId) : null;
    const caption = !waiting
      ? (PHASE_LABEL[phase] ?? phase)
      : over
        ? "This step never ran."
        : "This fills in when the run reaches this step.";

    // The words AND the shape: the caption is never dropped, so a slot that
    // waits a long time (or a run that pauses) always says what it is waiting
    // for, while the silhouette beneath it holds the footprint.
    if (reservedKind) {
      return (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">{caption}</p>
          <KindSlot
            slotKey={`${runId}:${nodeId}`}
            kind={reservedKind}
            phase="reserved"
            chrome="bare"
          />
        </div>
      );
    }
    return <p className="text-xs text-muted-foreground">{caption}</p>;
  }

  if (multiRun === "latest") {
    const latest = invocations[invocations.length - 1];
    return (
      <div ref={hostRef} className="space-y-1">
        {invocations.length > 1 ? (
          <p className="text-[11px] text-muted-foreground">
            {invocations.length} of {invocations.length} — showing the latest
          </p>
        ) : null}
        <InvocationBody
          runId={runId}
          invocation={latest}
          prefer={prefer}
          declaredKind={declaredKind}
        />
      </div>
    );
  }

  if (multiRun === "table") {
    return (
      <div ref={hostRef}>
        <MatrxDataTable<NodeInvocationState>
          data={invocations as NodeInvocationState[]}
          columns={INVOCATION_COLUMNS}
          getRowId={(inv) => inv.invocationKey}
          pageSize={0}
        />
      </div>
    );
  }

  // "stack" — every invocation, full bodies.
  return (
    <div ref={hostRef} className="space-y-2">
      {invocations.map((inv) => (
        <div key={inv.invocationKey}>
          {invocations.length > 1 ? (
            <div className="mb-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <PhaseIcon phase={inv.phase} />
              Item {inv.itemIndex + 1}
              {inv.iteration !== null ? ` · pass ${inv.iteration + 1}` : ""}
            </div>
          ) : null}
          {/* The progress message is rendered BY InvocationBody's working
              state — printing it again here put the same sentence on screen
              twice in every step that reports progress. */}
          <InvocationBody
            runId={runId}
            invocation={inv}
            prefer={prefer}
            declaredKind={declaredKind}
          />
        </div>
      ))}
    </div>
  );
}

function GroupMemberReadout({
  runId,
  nodeId,
  prefer,
  definition,
}: {
  runId: string;
  nodeId: string;
  prefer: "live" | "persisted";
  /** Read for this member's declared `output_kind` (bare-JSON stream guard). */
  definition?: WorkflowDefinitionLike;
}) {
  const aggregate = useAppSelector(selectNodeAggregate(runId, nodeId));
  const { phase, invocations, specType } = aggregate;
  const declaredKind = nodeOutputKind(definition, nodeId);
  const withBody = invocations.filter(invocationHasBody);
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-xs">
        <PhaseIcon phase={phase} />
        <span className="truncate font-medium">
          {specType ?? "Workflow step"}
        </span>
        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
          {PHASE_LABEL[phase] ?? phase}
        </span>
      </div>
      {withBody.map((inv) => (
        <InvocationBody
          key={inv.invocationKey}
          runId={runId}
          invocation={inv}
          prefer={prefer}
          declaredKind={declaredKind}
        />
      ))}
    </div>
  );
}

/* Run status → node-phase vocabulary for PhaseIcon, + human labels, now
 * shared: the workflow LIST names the same statuses, and a third copy would
 * have made three vocabularies for one enum. See ../run-status.tsx. */

interface CompactChildSurface {
  /** Which child definition this was loaded for (guards stale results). */
  definitionId: string;
  definition: WorkflowDefinitionLike;
  config: RunSurfaceConfig;
}

/**
 * The R9 compact child profile: a childRun readout renders the child
 * workflow's OWN authored compact surface when one exists (audience/profile
 * on `workflow.runtime_surface`). Without one, an honest compact summary
 * (status line) with an expandable full board — never a full board forced
 * into a small cell.
 */
function ChildRunReadout({
  runId,
  nodeId,
}: {
  runId: string;
  nodeId: string;
}) {
  const childRunId = useAppSelector(selectChildRunIdForNode(runId, nodeId));
  const childDefinitionId = useAppSelector(
    selectRunDefinitionId(childRunId ?? ""),
  );
  const childStatus = useAppSelector(selectRunStatus(childRunId ?? ""));
  const [loaded, setLoaded] = useState<CompactChildSurface | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    // No definition id on the child run (older engine events) — nothing to
    // look up; the summary fallback below renders instead.
    if (!childDefinitionId) return;
    let cancelled = false;
    void Promise.all([
      fetchWorkflowDefinition(childDefinitionId),
      getDefaultSurface(childDefinitionId, { profile: "compact" }),
    ])
      .then(([def, surf]) => {
        if (cancelled || !def || !surf) return;
        setLoaded({
          definitionId: childDefinitionId,
          definition: def.definition,
          config: surf.config,
        });
      })
      .catch(() => {
        // A failed lookup must never break the parent surface — the summary
        // fallback below is always renderable.
      });
    return () => {
      cancelled = true;
    };
  }, [childDefinitionId]);

  const compact =
    loaded && loaded.definitionId === childDefinitionId ? loaded : null;

  if (!childRunId) {
    return (
      <p className="text-[11px] text-muted-foreground">
        Starts when this step runs
      </p>
    );
  }

  // The parent adapter already follows linked children — never adopt again.
  if (compact) {
    return (
      <RunSurfaceView
        runId={childRunId}
        definition={compact.definition}
        config={compact.config}
        adopt={false}
      />
    );
  }

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-1.5 text-left text-xs"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <PhaseIcon phase={RUN_STATUS_PHASE[childStatus ?? ""] ?? "idle"} />
        <span className="font-medium">Sub-workflow</span>
        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
          {RUN_STATUS_LABEL[childStatus ?? ""] ?? childStatus ?? "…"}
        </span>
      </button>
      {expanded ? <WorkflowRunBoard runId={childRunId} adopt={false} /> : null}
    </div>
  );
}

const READINESS_NOTE: Record<NodeActionReadiness, string> = {
  waiting: "Waiting for earlier steps",
  ready: "Ready to run",
  running: "Working…",
  done: "Done — run again if you want a fresh result",
  failed: "The last run needs attention — try again",
};

/** executeNode is a PARKED-run verb (step-mode/paused/errored). While the
 * engine itself is driving the run, firing it would double-execute a node
 * the scheduler is about to run — actions stay locked with an honest note. */
const PARKED_RUN_STATUSES: ReadonlySet<string> = new Set(["paused", "errored"]);

/**
 * The Phase 4 action readout: a verb button that UNLOCKS when the node's
 * dependencies are ready (nodeActionReadiness — the blog-post example: the
 * post needs research + script, not audio). Manual mode waits for the click;
 * auto mode fires ONCE when ready (the user can flip the toggle live).
 * Execution goes through the ONE controls hook (`executeNode`); progress
 * arrives on the adopted run stream like any other node.
 */
function ActionReadout({
  runId,
  nodeId,
  label,
  mode,
  definition,
}: {
  runId: string;
  nodeId: string;
  label: string;
  mode: "manual" | "auto";
  definition?: WorkflowDefinitionLike;
}) {
  const nodePhases = useAppSelector(selectNodeAggregatePhases(runId));
  const sticky = useAppSelector(selectRunStickyFacts(runId));
  const runStatus = useAppSelector(selectRunStatus(runId));
  const { executeNode } = useWorkflowRunControls();
  const [auto, setAuto] = useState(mode === "auto");
  // ONE in-flight guard shared by the click AND the auto effect — without
  // it, the window between firing and the stream's phase flip left the
  // button clickable for a duplicate execute.
  const [inFlight, setInFlight] = useState(false);
  const autoFiredRef = useRef(false);

  const readiness: NodeActionReadiness = definition
    ? nodeActionReadiness(definition, nodeId, {
        runStatus,
        nodePhases,
        marks: EMPTY_MARKS,
        deliverableNodeId: null,
        sticky,
      })
    : "waiting";
  const parked = runStatus !== null && PARKED_RUN_STATUSES.has(runStatus);

  const executeRef = useRef(executeNode);
  useEffect(() => {
    executeRef.current = executeNode;
  });

  const fire = () => {
    setInFlight(true);
    void executeRef.current(runId, nodeId).finally(() => setInFlight(false));
  };
  const fireRef = useRef(fire);
  useEffect(() => {
    fireRef.current = fire;
  });

  // Auto mode fires ONCE on the waiting→ready edge — parked runs only (the
  // engine drives non-parked runs itself). Deferred a microtask so the
  // in-flight state set happens outside the effect body.
  useEffect(() => {
    if (!auto || !parked || readiness !== "ready" || autoFiredRef.current) {
      return;
    }
    autoFiredRef.current = true;
    void Promise.resolve().then(() => fireRef.current());
  }, [auto, parked, readiness]);

  const clickable =
    !inFlight &&
    parked &&
    (readiness === "ready" || readiness === "done" || readiness === "failed");

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!clickable}
          onClick={fire}
          className={
            clickable
              ? "rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground"
              : "rounded-md border border-border bg-muted px-3 py-1.5 text-xs text-muted-foreground opacity-60"
          }
        >
          {readiness === "running" || inFlight
            ? "Working…"
            : readiness === "failed"
              ? `${label} (try again)`
              : label}
        </button>
        <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            checked={auto}
            onChange={(e) => {
              setAuto(e.target.checked);
              // Re-arm: flipping auto ON while already ready should fire.
              if (e.target.checked) autoFiredRef.current = false;
            }}
          />
          Run automatically when ready
        </label>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {!parked && readiness === "ready"
          ? "This workflow runs it automatically"
          : READINESS_NOTE[readiness]}
      </p>
    </div>
  );
}

export function ReadoutView({
  runId,
  readout,
  ensureLane,
  definition,
}: {
  runId: string;
  readout: Readout;
  /** Lane promotion bound to this readout's run (from the adoption handle). */
  ensureLane?: EnsureLaneFn;
  /** The workflow graph — action readouts derive readiness from its edges. */
  definition?: WorkflowDefinitionLike;
}) {
  const source: ReadoutSource = readout.source;
  const prefer = readout.prefer ?? "live";
  switch (source.kind) {
    case "node":
      return (
        <NodeReadout
          runId={runId}
          nodeId={source.nodeId}
          multiRun={readout.multiRun ?? "stack"}
          prefer={prefer}
          ensureLane={ensureLane}
          definition={definition}
        />
      );
    case "group":
      return (
        <div className="space-y-2">
          {source.nodeIds.map((nodeId) => (
            <GroupMemberReadout
              key={nodeId}
              runId={runId}
              nodeId={nodeId}
              prefer={prefer}
              definition={definition}
            />
          ))}
        </div>
      );
    case "childRun":
      return <ChildRunReadout runId={runId} nodeId={source.nodeId} />;
    case "progressRail":
      return (
        <ProgressRailReadout
          runId={runId}
          nodeIds={source.nodeIds}
          nodeLabels={
            definition ? definitionNodeLabels(definition) : undefined
          }
          syntheticSteps={source.syntheticSteps}
        />
      );
    case "static":
      return <MarkdownStream content={source.markdown} />;
    case "action":
      return (
        <ActionReadout
          runId={runId}
          nodeId={source.nodeId}
          label={source.label}
          mode={source.mode}
          definition={definition}
        />
      );
    default:
      return null;
  }
}
