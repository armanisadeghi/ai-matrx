"use client";

/**
 * WorkflowRunSpatialView — a workflow run (live or finished) as a spatial
 * board: every step of the DEFINITION is a tile from the first frame, laid out
 * stage by stage (`run-board-layout.ts`), and each one comes to life as the
 * run reaches it.
 *
 * It CONSUMES the spatial engine (features/spatial) and the run runtime; it
 * renders nothing of its own:
 *   - a step holding a streaming lane → `StreamTileBody` over
 *     `useRequestSource(laneRequestId)` — the one pipeline, paced by zoom;
 *   - a step without a lane (tracked tier, or settled) → the canonical
 *     `InvocationBody` — the same renderer the Page view uses;
 *   - a step that has not started → words naming what it waits for, plus the
 *     reserved silhouette of the kind it promised (`KindSlot`).
 *
 * Lanes are viewer-driven: a single-invocation step that is running and on
 * screen at read or glance tier is promoted (`ensureLane`, seeded with its
 * tracked tail). Off-screen and far-zoom steps stay in the tracked tier.
 *
 * The run is adopted here (`useWorkflowRun`) and handed to the floating window
 * on unmount while live (`useFloatingWorkflowRun`) — THE FLOATING LAW binds
 * the board exactly as it binds the page.
 */

import { useEffect, useState } from "react";
import { shallowEqual } from "react-redux";
import {
  UserRoundCog,
  BrainCircuit,
  ClipboardPen,
  Layers,
  PackageCheck,
  type LucideIcon,
} from "lucide-react";

import { useAppSelector, useAppStore } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/rootReducer";
import { toast } from "@/lib/toast";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import {
  ensureOrganizationContext,
  isOrganizationSelectionCancelled,
} from "@/lib/organization/organization-gate";
import { NotesAPI } from "@/features/notes/service/notesApi";
import { KindSlot } from "@/features/content-ir/react/slot/KindSlot";
import { selectRequestCarriesKindEnvelope } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";

import type { PaceTier } from "@/features/spatial/engine/lod";
import type { SpatialStore } from "@/features/spatial/engine/spatial-store";
import { DEFAULT_THROW_ACTIONS, type ThrowDirection } from "@/features/spatial/engine/throw";
import { useBoard, type BoardFrame } from "@/features/spatial/board/useBoard";
import { useWheelModePreference } from "@/features/spatial/board/useWheelModePreference";
import { SpatialBoardMenu } from "@/features/spatial/components/SpatialBoardMenu";
import { ParkedShelf } from "@/features/spatial/components/ParkedShelf";
import { SpatialViewport } from "@/features/spatial/components/SpatialViewport";
import { SpatialTile } from "@/features/spatial/components/SpatialTile";
import { SpatialFrame } from "@/features/spatial/components/SpatialFrame";
import { SpatialEdge } from "@/features/spatial/components/SpatialEdge";
import { Minimap, ZoomHud } from "@/features/spatial/components/SpatialChrome";
import type { StatusFrom, TileStatusValue } from "@/features/spatial/streams/useSourceStatus";
import { useRequestSource } from "@/features/spatial/streams/useRequestSource";
import { StreamTileBody } from "@/features/spatial/tiles/StreamTileBody";

import { useWorkflowRun } from "../../hooks/useWorkflowRun";
import { useFloatingWorkflowRun } from "../../floating/useFloatingWorkflowRun";
import {
  selectNodeAggregate,
  selectRunStatus,
} from "../../redux/workflow-runs.selectors";
import { runIsOver } from "../../types";
import { RUN_STATUS_LABEL } from "../../run-status";
import { resultSchemaOrNull, useResultSchema } from "../../kind-emissions/useResultSchema";
import type { WorkflowDefinitionLike } from "../../trigger-points";
import { InterruptCard, InvocationBody, PHASE_LABEL, PhaseIcon } from "../readout-parts";
import {
  describeWorkflowSteps,
  familyNoun,
  humanizeKind,
  type NodeFamily,
  type RunStepPresentation,
} from "../run/node-presentation";
import { layoutWorkflowRunBoard, type RunBoardLayout } from "./run-board-layout";

const FAMILY_TILE_ICON: Record<NodeFamily, LucideIcon> = {
  input: ClipboardPen,
  prepare: Layers,
  think: BrainCircuit,
  agent: UserRoundCog,
  deliver: PackageCheck,
};

interface RunTileSpec {
  id: string;
  rect: { x: number; y: number; w: number; h: number };
  title: string;
  subtitle: string;
  icon: LucideIcon;
  declaredKind: string | null;
  /** Human names of the steps this one waits on. */
  waitsFor: string[];
}

type EnsureLane = (runId: string, invocationKey: string, seedText?: string) => string | null;

export interface WorkflowRunSpatialViewProps {
  runId: string;
  definitionId: string;
  definition: WorkflowDefinitionLike;
  workflowName: string;
}

export default function WorkflowRunSpatialView({
  runId,
  definitionId,
  definition,
  workflowName,
}: WorkflowRunSpatialViewProps) {
  const steps = describeWorkflowSteps(definition);
  const stepLabels: Record<string, string> = {};
  for (const step of steps) stepLabels[step.nodeId] = step.label;

  useFloatingWorkflowRun({ runId, workflowName, stepLabels });
  const { ensureLane } = useWorkflowRun(runId);
  const schemaState = useResultSchema(definitionId);

  // The board is laid out ONCE, with every deliverable already sized — so it
  // waits for the declared promise rather than re-arranging under the reader
  // when it lands. An unreadable promise falls back to the definition's own
  // `output_kind` declarations.
  if (schemaState.status === "loading") return <BoardSkeleton />;
  const declared = resultSchemaOrNull(schemaState);
  const deliverableIds = new Set<string>(
    declared
      ? declared.deliverables.map((d) => d.nodeId)
      : steps.filter((s) => s.outputKind !== null).map((s) => s.nodeId),
  );
  const primaryIds = new Set<string>(
    declared ? declared.deliverables.filter((d) => d.isPrimary).map((d) => d.nodeId) : [],
  );

  return (
    <RunBoard
      key={`${runId}:${definitionId}`}
      runId={runId}
      workflowName={workflowName}
      definition={definition}
      steps={steps}
      deliverableIds={deliverableIds}
      primaryIds={primaryIds}
      ensureLane={ensureLane}
    />
  );
}

/** Calm first paint while the declared promise is read — never a spinner. */
function BoardSkeleton() {
  return (
    <div className="grid h-full grid-cols-3 gap-6 bg-textured p-8" aria-busy>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-64 animate-pulse rounded-xl bg-muted/50" />
      ))}
    </div>
  );
}

function buildBoard(
  definition: WorkflowDefinitionLike,
  steps: RunStepPresentation[],
  deliverableIds: ReadonlySet<string>,
  primaryIds: ReadonlySet<string>,
): { layout: RunBoardLayout; tiles: RunTileSpec[]; frames: BoardFrame[] } {
  const layout = layoutWorkflowRunBoard({
    nodes: definition.nodes,
    edges: definition.edges,
    deliverableIds,
  });
  const byId = new Map(steps.map((s) => [s.nodeId, s]));
  const label = (id: string) => byId.get(id)?.label ?? id;
  const tiles = layout.tiles.map((t): RunTileSpec => {
    const step = byId.get(t.nodeId);
    const family: NodeFamily = step?.family ?? "prepare";
    const kind = step?.outputKind ?? null;
    const role = primaryIds.has(t.nodeId)
      ? "Main deliverable"
      : t.deliverable
        ? "Deliverable"
        : familyNoun(family);
    return {
      id: t.nodeId,
      rect: t.rect,
      title: label(t.nodeId),
      subtitle: kind ? `${role} · ${humanizeKind(kind)}` : role,
      icon: t.deliverable ? PackageCheck : FAMILY_TILE_ICON[family],
      declaredKind: kind,
      waitsFor: layout.edges.filter((e) => e.to === t.nodeId).map((e) => label(e.from)),
    };
  });
  const frames = layout.frames.map((f): BoardFrame => {
    const deliverables = f.nodeIds.filter((id) => deliverableIds.has(id)).length;
    const count = `${f.nodeIds.length} ${f.nodeIds.length === 1 ? "step" : "steps"}`;
    return {
      id: f.id,
      rect: f.rect,
      title: `Stage ${f.layer + 1}`,
      note:
        deliverables > 0
          ? `${count} · ${deliverables} ${deliverables === 1 ? "deliverable" : "deliverables"}`
          : count,
    };
  });
  return { layout, tiles, frames };
}

function RunBoard({
  runId,
  workflowName,
  definition,
  steps,
  deliverableIds,
  primaryIds,
  ensureLane,
}: {
  runId: string;
  workflowName: string;
  definition: WorkflowDefinitionLike;
  steps: RunStepPresentation[];
  deliverableIds: ReadonlySet<string>;
  primaryIds: ReadonlySet<string>;
  ensureLane: EnsureLane;
}) {
  const [built] = useState(() => buildBoard(definition, steps, deliverableIds, primaryIds));
  const board = useBoard<RunTileSpec>(() => ({ tiles: built.tiles, frames: built.frames }));
  const [store, setStore] = useState<SpatialStore | null>(null);
  const [wheelMode, setWheelMode] = useWheelModePreference();
  const activeOrgId = useAppSelector(selectOrganizationId);

  const specOf = (id: string) => [...board.tiles, ...board.parked].find((t) => t.id === id);

  const park = (id: string) => {
    const undo = board.parkTile(id);
    toast(`Parked "${specOf(id)?.title ?? "step"}"`, { action: { label: "Undo", onClick: undo } });
  };
  const unpark = (id: string) => {
    board.unparkTile(id);
    requestAnimationFrame(() => requestAnimationFrame(() => store?.fitItem(id)));
  };
  const saveAndClose = async (id: string) => {
    const spec = specOf(id);
    if (!spec) return;
    const body = document.querySelector<HTMLElement>(
      `[data-spatial-card="${CSS.escape(id)}"] [data-spatial-body]`,
    );
    const text = body?.innerText.trim() ?? "";
    if (!text) {
      toast.error(`"${spec.title}" has nothing to save yet — this step has not produced anything.`);
      return;
    }
    try {
      const organizationId = await ensureOrganizationContext({ organizationId: activeOrgId });
      await NotesAPI.create({
        label: `${workflowName} — ${spec.title}`,
        content: `# ${spec.title}\n\n${text}`,
        folder_name: "Scratch",
        tags: ["board", "workflow-run"],
        organization_id: organizationId,
      });
    } catch (err) {
      if (isOrganizationSelectionCancelled(err)) return;
      toast.error(
        `Could not save "${spec.title}" to Notes: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }
    const undo = board.removeTile(id);
    toast.success(`Saved "${spec.title}" to Notes (Scratch) and took it off the board`, {
      action: { label: "Put back", onClick: undo },
    });
  };
  const remove = async (id: string) => {
    const spec = specOf(id);
    if (!spec) return;
    const ok = await confirm({
      title: `Take "${spec.title}" off this board?`,
      description:
        "Only this board view changes: the run, this step and its output are kept, and the Page view still shows them. You can undo right after.",
      confirmLabel: "Take off board",
      variant: "destructive",
    });
    if (!ok) return;
    const undo = board.removeTile(id);
    toast(`Took "${spec.title}" off the board`, { action: { label: "Undo", onClick: undo } });
  };
  const onThrow = (id: string, direction: ThrowDirection) => {
    const action = DEFAULT_THROW_ACTIONS[direction];
    if (action === "park") park(id);
    else if (action === "save-close") void saveAndClose(id);
    else if (action === "delete") void remove(id);
  };

  const rectById = new Map(board.tiles.map((t) => [t.id, t.rect]));

  return (
    <SpatialBoardMenu
      store={store}
      actions={{
        park,
        saveAndClose: (id) => void saveAndClose(id),
        remove: (id) => void remove(id),
        removeLabel: "Take off this board…",
      }}
      parked={board.parked.map((t) => ({ id: t.id, title: t.title }))}
      onUnpark={unpark}
      wheelMode={wheelMode}
      onWheelMode={setWheelMode}
    >
      <SpatialViewport
        insets={{ top: 88, bottom: 56 }}
        wheelMode={wheelMode}
        onStore={setStore}
        overlay={
          <>
            <RunBoardToolbar runId={runId} workflowName={workflowName} stepCount={steps.length} />
            <ParkedShelf
              parked={board.parked.map((t) => ({ id: t.id, title: t.title, icon: t.icon }))}
              onRestore={unpark}
            />
            <ZoomHud />
            <Minimap />
          </>
        }
      >
        {board.frames.map((f) => (
          <SpatialFrame key={f.id} id={f.id} rect={f.rect} title={f.title} note={f.note} />
        ))}
        {built.layout.edges.map((e) => {
          const from = rectById.get(e.from);
          const to = rectById.get(e.to);
          if (!from || !to) return null;
          return <SpatialEdge key={e.id} from={from} to={to} />;
        })}
        {board.tiles.map((t) => (
          <RunNodeTile
            key={t.id}
            runId={runId}
            spec={t}
            onMove={board.moveTile}
            onThrow={onThrow}
            ensureLane={ensureLane}
          />
        ))}
      </SpatialViewport>
    </SpatialBoardMenu>
  );
}

function RunBoardToolbar({
  runId,
  workflowName,
  stepCount,
}: {
  runId: string;
  workflowName: string;
  stepCount: number;
}) {
  const status = useAppSelector(selectRunStatus(runId));
  const statusLabel = status ? (RUN_STATUS_LABEL[status] ?? status) : "Connecting to the run";
  return (
    <div
      data-spatial-chrome
      className="absolute left-4 top-4 flex max-w-[min(28rem,calc(100%-2rem))] flex-col gap-2"
    >
      <div className="rounded-lg border border-border bg-card/95 px-3 py-2 shadow-md backdrop-blur">
        <p className="truncate text-sm font-semibold text-foreground">{workflowName}</p>
        <p className="text-[11px] text-muted-foreground">
          {`${statusLabel} · ${stepCount} ${stepCount === 1 ? "step" : "steps"}`}
        </p>
      </div>
      {/* A run parked on a question is blocked on this person — the board
          must ask it, not leave them staring at a paused plane. */}
      <div className="max-h-[50vh] overflow-y-auto rounded-lg empty:hidden">
        <InterruptCard runId={runId} />
      </div>
    </div>
  );
}

// ── one step ────────────────────────────────────────────────────────────────

/** The node's coarse status as one primitive, so a token never re-renders the tile. */
function selectStatusKey(runId: string, nodeId: string) {
  const selectAggregate = selectNodeAggregate(runId, nodeId);
  const selectStatus = selectRunStatus(runId);
  return (state: RootState): string => {
    const agg = selectAggregate(state);
    const over = runIsOver(selectStatus(state));
    switch (agg.phase) {
      case "running":
      case "retrying":
        return agg.expectedCount > 1
          ? `streaming:${Math.floor((agg.settledCount / agg.expectedCount) * 20)}`
          : "streaming:-1";
      case "settled":
      case "skipped":
        return "complete:-1";
      case "failed":
        return "error:-1";
      default:
        return over ? "idle:-1" : "queued:-1";
    }
  };
}

function useNodeStatus(runId: string, nodeId: string): TileStatusValue {
  const [selectKey] = useState(() => selectStatusKey(runId, nodeId));
  const key = useAppSelector(selectKey);
  const [status, step] = key.split(":");
  const n = Number(step);
  return { status: status as TileStatusValue["status"], progress: n < 0 ? null : n / 20 };
}

function RunNodeTile({
  runId,
  spec,
  onMove,
  onThrow,
  ensureLane,
}: {
  runId: string;
  spec: RunTileSpec;
  onMove: (id: string, x: number, y: number) => void;
  onThrow: (id: string, direction: ThrowDirection) => void;
  ensureLane: EnsureLane;
}) {
  const value = useNodeStatus(runId, spec.id);
  const statusFrom: StatusFrom = { kind: "static", value };
  return (
    <SpatialTile
      id={spec.id}
      rect={spec.rect}
      title={spec.title}
      subtitle={spec.subtitle}
      icon={spec.icon}
      statusFrom={statusFrom}
      onMove={onMove}
      onThrow={onThrow}
    >
      {(tier) => (
        <RunNodeBody
          runId={runId}
          nodeId={spec.id}
          tier={tier}
          declaredKind={spec.declaredKind}
          waitsFor={spec.waitsFor}
          ensureLane={ensureLane}
        />
      )}
    </SpatialTile>
  );
}

interface BodyShape {
  count: number;
  expected: number;
  phase: string;
  firstKey: string | null;
  firstPhase: string | null;
  laneRequestId: string | null;
  laneCarried: boolean;
  settledOutput: boolean;
  over: boolean;
}

/** Only what decides WHICH body renders — the bodies read their own content. */
function selectBodyShape(runId: string, nodeId: string) {
  const selectAggregate = selectNodeAggregate(runId, nodeId);
  const selectStatus = selectRunStatus(runId);
  return (state: RootState): BodyShape => {
    const agg = selectAggregate(state);
    const first = agg.invocations[0] ?? null;
    return {
      count: agg.invocations.length,
      expected: agg.expectedCount,
      phase: agg.phase,
      firstKey: first?.invocationKey ?? null,
      firstPhase: first?.phase ?? null,
      laneRequestId: first?.laneRequestId ?? null,
      laneCarried: (first?.chunksReceived ?? 0) > 0,
      settledOutput:
        first !== null &&
        first.phase === "settled" &&
        first.output !== null &&
        Object.keys(first.output).length > 0,
      over: runIsOver(selectStatus(state)),
    };
  };
}

function RunNodeBody({
  runId,
  nodeId,
  tier,
  declaredKind,
  waitsFor,
  ensureLane,
}: {
  runId: string;
  nodeId: string;
  tier: PaceTier;
  declaredKind: string | null;
  waitsFor: string[];
  ensureLane: EnsureLane;
}) {
  const store = useAppStore();
  const [selectShape] = useState(() => selectBodyShape(runId, nodeId));
  const shape = useAppSelector(selectShape, shallowEqual);
  const single = shape.count === 1 && shape.expected <= 1;
  const laneCarriesKind = useAppSelector(
    selectRequestCarriesKindEnvelope(shape.laneRequestId ?? ""),
  );

  // Viewer-driven promotion: a running single-invocation step, readable on
  // screen, gets a streaming lane seeded with what it has said so far. Fan-out
  // steps stay tracked (their deltas carry node_id alone — a promoted sibling
  // lane would never receive content; same guard as ReadoutView).
  const visible = tier === "read" || tier === "glance";
  const promotable =
    visible && single && shape.firstPhase === "running" && shape.laneRequestId === null;
  useEffect(() => {
    if (!promotable || !shape.firstKey) return;
    const inv = store.getState().workflowRuns.byRunId[runId]?.nodes[shape.firstKey];
    ensureLane(runId, shape.firstKey, inv?.textTail || undefined);
  }, [promotable, shape.firstKey, runId, ensureLane, store]);

  if (shape.count === 0) {
    return (
      <QueuedBody
        runId={runId}
        nodeId={nodeId}
        phase={shape.phase}
        over={shape.over}
        declaredKind={declaredKind}
        waitsFor={waitsFor}
      />
    );
  }

  // The settled document takes over from the raw feed when the RUN ends — the
  // same hand-over InvocationBody makes (prefer "live").
  const documentWins = shape.settledOutput && shape.over;
  // A step that promised a kind but streams bare JSON keeps InvocationBody,
  // which shows that kind's arriving silhouette instead of raw text.
  const laneStreams =
    single &&
    shape.laneRequestId !== null &&
    shape.laneCarried &&
    !documentWins &&
    (laneCarriesKind || !declaredKind);
  if (laneStreams && shape.laneRequestId) {
    return <LaneBody key={shape.laneRequestId} requestId={shape.laneRequestId} tier={tier} />;
  }
  return <TrackedBody runId={runId} nodeId={nodeId} declaredKind={declaredKind} />;
}

function LaneBody({ requestId, tier }: { requestId: string; tier: PaceTier }) {
  const source = useRequestSource(requestId, "workflow-run-board");
  return <StreamTileBody source={source} tier={tier} emptyLabel="Working on this now" />;
}

function TrackedBody({
  runId,
  nodeId,
  declaredKind,
}: {
  runId: string;
  nodeId: string;
  declaredKind: string | null;
}) {
  const [selectAggregate] = useState(() => selectNodeAggregate(runId, nodeId));
  const { invocations } = useAppSelector(selectAggregate);
  return (
    <div data-spatial-scroll className="h-full space-y-2 overflow-y-auto overscroll-contain px-4 py-3 text-sm">
      {invocations.map((inv) => (
        <div key={inv.invocationKey}>
          {invocations.length > 1 ? (
            <div className="mb-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <PhaseIcon phase={inv.phase} />
              {`Item ${inv.itemIndex + 1}${inv.iteration !== null ? ` · pass ${inv.iteration + 1}` : ""}`}
            </div>
          ) : null}
          <InvocationBody runId={runId} invocation={inv} declaredKind={declaredKind} />
        </div>
      ))}
    </div>
  );
}

/** A step that has not started: what it waits for, and the shape it will be. */
function QueuedBody({
  runId,
  nodeId,
  phase,
  over,
  declaredKind,
  waitsFor,
}: {
  runId: string;
  nodeId: string;
  phase: string;
  over: boolean;
  declaredKind: string | null;
  waitsFor: string[];
}) {
  const waiting = phase === "idle" || phase === "waiting";
  let caption: string;
  if (!waiting) caption = PHASE_LABEL[phase] ?? phase;
  else if (over) caption = "This step never ran.";
  else if (waitsFor.length === 0) caption = "Starts as soon as the run begins.";
  else caption = `Starts after ${joinNames(waitsFor)}.`;
  const reserve = waiting && !over ? declaredKind : null;
  return (
    <div className="h-full space-y-2 overflow-hidden px-4 py-3">
      <p className="text-xs text-muted-foreground">{caption}</p>
      {reserve ? (
        <KindSlot slotKey={`${runId}:${nodeId}`} kind={reserve} phase="reserved" chrome="bare" />
      ) : null}
    </div>
  );
}

function joinNames(names: string[]): string {
  const quoted = names.map((n) => `“${n}”`);
  if (quoted.length <= 2) return quoted.join(" and ");
  return `${quoted.slice(0, 2).join(", ")} and ${quoted.length - 2} more`;
}
