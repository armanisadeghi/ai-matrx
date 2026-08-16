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
import {
  getDefaultSurface,
  fetchWorkflowDefinition,
} from "../surface/service";
import type { WorkflowDefinitionLike } from "../trigger-points";
import {
  selectChildRunIdForNode,
  selectNodeAggregate,
  selectRunDefinitionId,
  selectRunStatus,
} from "../redux/workflow-runs.selectors";
import type { NodeInvocationState } from "../redux/workflow-runs.slice";
import { InvocationBody, PhaseIcon, PHASE_LABEL } from "./readout-parts";
import { ProgressRailReadout } from "./ProgressRailReadout";
import { RunSurfaceView } from "./RunSurfaceView";
import { WorkflowRunBoard } from "./WorkflowRunBoard";

/** Promotion callback bound to the readout's run by the hosting surface. */
export type EnsureLaneFn = (
  invocationKey: string,
  seedText?: string,
) => string | null;

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

  useEffect(() => {
    const el = hostRef.current;
    if (!el || !ensureLane) return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) setInView(entry.isIntersecting);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ensureLane]);

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
}: {
  runId: string;
  nodeId: string;
  multiRun: "stack" | "latest" | "table";
  prefer: "live" | "persisted";
  ensureLane?: EnsureLaneFn;
}) {
  const aggregate = useAppSelector(selectNodeAggregate(runId, nodeId));
  const { invocations, phase } = aggregate;
  const hostRef = useViewportLanePromotion(invocations, ensureLane);

  if (invocations.length === 0) {
    // No invocations → nothing to promote, so no observer host needed.
    return (
      <p className="text-[11px] text-muted-foreground">
        {PHASE_LABEL[phase] ?? phase}
      </p>
    );
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
        <InvocationBody runId={runId} invocation={latest} prefer={prefer} />
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
          <InvocationBody runId={runId} invocation={inv} prefer={prefer} />
          {inv.progress?.message ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {inv.progress.message}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function GroupMemberReadout({
  runId,
  nodeId,
  prefer,
}: {
  runId: string;
  nodeId: string;
  prefer: "live" | "persisted";
}) {
  const aggregate = useAppSelector(selectNodeAggregate(runId, nodeId));
  const { phase, invocations, specType } = aggregate;
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
        />
      ))}
    </div>
  );
}

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
        <PhaseIcon phase={childStatus ?? "idle"} />
        <span className="font-medium">Sub-workflow</span>
        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
          {PHASE_LABEL[childStatus ?? ""] ?? childStatus ?? "…"}
        </span>
      </button>
      {expanded ? <WorkflowRunBoard runId={childRunId} adopt={false} /> : null}
    </div>
  );
}

function ActionReadout({ label }: { label: string }) {
  // Phase 4 wires execution; the stub keeps the authored surface honest.
  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled
        className="rounded-md border border-border bg-muted px-3 py-1.5 text-xs text-muted-foreground opacity-60"
      >
        {label}
      </button>
      <p className="text-[11px] text-muted-foreground">
        Ready when its step can run
      </p>
    </div>
  );
}

export function ReadoutView({
  runId,
  readout,
  ensureLane,
}: {
  runId: string;
  readout: Readout;
  /** Lane promotion bound to this readout's run (from the adoption handle). */
  ensureLane?: EnsureLaneFn;
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
          syntheticSteps={source.syntheticSteps}
        />
      );
    case "static":
      return <MarkdownStream content={source.markdown} />;
    case "action":
      return <ActionReadout label={source.label} />;
    default:
      return null;
  }
}
