"use client";

/**
 * WorkflowRunBoardView — a workflow run (live or finished) as a Board:
 * every step of the DEFINITION is a tile from the first frame, laid out
 * stage by stage (`run-board-layout.ts`), and each one comes to life as the
 * run reaches it.
 *
 * It CONSUMES the Board engine (features/board) and the run runtime; it
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
  Lightbulb,
  ClipboardPen,
  Code2,
  FileText,
  Globe,
  Image as ImageIcon,
  Layers,
  PackageCheck,
  StickyNote,
  Type,
  type LucideIcon,
} from "lucide-react";

import { useAppSelector, useAppStore } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/rootReducer";
import { toast } from "@/lib/toast";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { NotesAPI } from "@/features/notes/service/notesApi";
import { KindSlot } from "@ai-matrx/rich-content/kinds/react/slot/KindSlot";
import { selectRequestCarriesKindEnvelope } from "@ai-matrx/chat/agents/redux/execution-system/active-requests/active-requests.selectors";

import type { Rect } from "@/features/board/engine/camera";
import type { PaceTier } from "@/features/board/engine/lod";
import type { BoardCameraStore } from "@/features/board/engine/camera-store";
import {
  DEFAULT_THROW_ACTIONS,
  type ThrowAction,
  type ThrowDirection,
} from "@/features/board/engine/throw";

import { useBoard, type BoardFrame } from "@/features/board/board/useBoard";
import { useWheelModePreference } from "@/features/board/board/useWheelModePreference";
import { BoardMenu } from "@/features/board/components/BoardMenu";
import { ParkedShelf } from "@/features/board/components/ParkedShelf";
import { BoardViewport } from "@/features/board/components/BoardViewport";
import { BoardTile } from "@/features/board/components/BoardTile";
import { BoardFrameView } from "@/features/board/components/BoardFrameView";
import { BoardEdgeLine } from "@/features/board/components/BoardEdgeLine";
import { Minimap, ZoomHud } from "@/features/board/components/BoardChrome";
import type { StatusFrom, TileStatusValue } from "@/features/board/streams/useSourceStatus";
import { useRequestSource } from "@/features/board/streams/useRequestSource";
import { StreamTileBody } from "@/features/board/tiles/StreamTileBody";
import { MarkdownTileBody } from "@/features/board/tiles/MarkdownTileBody";
import { HtmlTileBody, ImageTileBody } from "@/features/board/tiles/MediaTileBodies";
import { TextTileBody } from "@/features/board/tiles/TextTileBody";
import { NoteItemBody } from "@/features/board/items/NoteItemBody";
import { entityId, noteSeedEdit } from "@/features/board/items/work-sources";
import type { NodeSource } from "@/features/board/board/document";
import { createItemSurfaceIndex } from "@/features/board/tools/item-surfaces";
import { TileSurfaceCapture } from "@/features/board/tools/TileSurfaceCapture";
import { useIsEditing } from "@/features/board/engine/react";
import { BoardSurface } from "@/features/board/components/BoardSurface";
import type {
  AddTileInput,
  BoardToolHost,
  EditTileInput,
} from "@/features/board/tools/useBoardAgentTools";

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
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";

/** Down only takes a tile off this board — the step stays in its run. */
const RUN_THROWS: Record<ThrowDirection, ThrowAction> = { ...DEFAULT_THROW_ACTIONS, down: "remove" };

const FAMILY_TILE_ICON: Record<NodeFamily, LucideIcon> = {
  input: ClipboardPen,
  prepare: Layers,
  think: Lightbulb,
  agent: UserRoundCog,
  deliver: PackageCheck,
};

/** What a tile holds: a STEP of the run (live results — never edited), or
 * something an agent (or the person, later) put beside the run. */
type RunTileContent =
  | {
      type: "step";
      family: NodeFamily;
      declaredKind: string | null;
      /** Human names of the steps this one waits on. */
      waitsFor: string[];
    }
  | { type: "markdown"; text: string }
  | { type: "html"; src?: string; srcDoc?: string }
  | { type: "image"; src: string }
  /** A real Note, in the notes core (the Board's note item body). */
  | { type: "note"; source: NodeSource }
  | { type: "text"; text: string };

interface RunTileSpec {
  id: string;
  rect: { x: number; y: number; w: number; h: number };
  title: string;
  subtitle: string;
  icon: LucideIcon;
  content: RunTileContent;
}

type EnsureLane = (runId: string, invocationKey: string, seedText?: string) => string | null;

export interface WorkflowRunBoardViewProps {
  runId: string;
  definitionId: string;
  definition: WorkflowDefinitionLike;
  workflowName: string;
}

export default function WorkflowRunBoardView({
  runId,
  definitionId,
  definition,
  workflowName,
}: WorkflowRunBoardViewProps) {
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
      content: {
        type: "step",
        family,
        declaredKind: kind,
        waitsFor: layout.edges.filter((e) => e.to === t.nodeId).map((e) => label(e.from)),
      },
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
  const [store, setStore] = useState<BoardCameraStore | null>(null);
  // Each Notes tile's own surface capture: the Board bridge (`board_items` basics, `board_open_item`).
  const [itemSurfaces] = useState(createItemSurfaceIndex);
  const [wheelMode, setWheelMode] = useWheelModePreference();
  const activeOrgId = useAppSelector(selectOrganizationId);
  const reduxStore = useAppStore();

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
      `[data-board-card="${CSS.escape(id)}"] [data-board-body]`,
    );
    const text = body?.innerText.trim() ?? "";
    if (!text) {
      toast.error(`"${spec.title}" has nothing to save yet — this step has not produced anything.`);
      return;
    }
    try {
      const organizationId = await ensureOrgId(null);
      await NotesAPI.create({
        label: `${workflowName} — ${spec.title}`,
        content: `# ${spec.title}\n\n${text}`,
        folder_name: "Scratch",
        tags: ["board", "workflow-run"],
        organization_id: organizationId,
      });
    } catch (err) {
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
        spec.content.type === "step"
          ? "Only this board view changes: the run, this step and its output are kept, and the Page view still shows them. You can undo right after."
          : "The tile leaves this board. You can undo right after.",
      confirmLabel: "Take off board",
      variant: "destructive",
    });
    if (!ok) return;
    const undo = board.removeTile(id);
    toast(`Took "${spec.title}" off the board`, { action: { label: "Undo", onClick: undo } });
  };
  const onThrow = (id: string, direction: ThrowDirection) => {
    const action = RUN_THROWS[direction];
    if (action === "park") park(id);
    else if (action === "save-close") void saveAndClose(id);
    else if (action === "remove") void remove(id);
  };

  const rectById = new Map(board.tiles.map((t) => [t.id, t.rect]));

  const agentHost: BoardToolHost<RunTileSpec> = {
    board,
    store,
    boardTitle: workflowName,
    itemSurfaces,
    createTile: createAgentTile,
    editTile: editAgentTile,
    describe: (tile) => {
      const c = tile.content;
      // A Notes tile carries the notes surface (AddedTile). A step's data lives on the run's own surface
      // (`matrx-user/workflow-run`, stacked above this board), so a step has no item surface of its own.
      if (c.type !== "step") {
        return { kind: c.type === "html" && c.srcDoc === undefined ? "web page" : c.type, surface: c.type === "note" ? "matrx-user/notes" : null };
      }
      const status = selectStatusKey(runId, tile.id)(reduxStore.getState()).split(":")[0];
      return { kind: `${familyNoun(c.family)}${c.declaredKind ? ` · ${humanizeKind(c.declaredKind)}` : ""}`, status };
    },
  };
  const onContent = (id: string, content: RunTileContent, title?: string) =>
    board.updateTile(id, title ? { content, title } : { content }, { history: false });

  return (
    <BoardSurface host={agentHost}>
      <BoardMenu
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
        <BoardViewport
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
            <BoardFrameView key={f.id} id={f.id} rect={f.rect} title={f.title} note={f.note} />
          ))}
          {built.layout.edges.map((e) => {
            const from = rectById.get(e.from);
            const to = rectById.get(e.to);
            if (!from || !to) return null;
            return <BoardEdgeLine key={e.id} from={from} to={to} />;
          })}
          {board.connections.map((c) => {
            const from = rectById.get(c.from);
            const to = rectById.get(c.to);
            if (!from || !to) return null;
            return <BoardEdgeLine key={c.id} from={from} to={to} />;
          })}
          {board.tiles.map((t) =>
            t.content.type === "step" ? (
              <RunNodeTile
                key={t.id}
                runId={runId}
                spec={t}
                declaredKind={t.content.declaredKind}
                waitsFor={t.content.waitsFor}
                onMove={board.moveTile}
                onResize={board.resizeTile}
                onThrow={onThrow}
                ensureLane={ensureLane}
              />
            ) : (
              <AddedTile
                key={t.id}
                spec={t}
                onMove={board.moveTile}
                onResize={board.resizeTile}
                onThrow={onThrow}
                onContent={onContent}
              />
            ),
          )}
        </BoardViewport>
      </BoardMenu>
    </BoardSurface>
  );
}

// ── what the board's agent tools make and change (useBoardAgentTools) ───────

type Failure = { ok: false; error: string };

const ADDED_ICON: Record<AddTileInput["kind"], LucideIcon> = {
  note: StickyNote,
  markdown: FileText,
  text: Type,
  html: Code2,
  image: ImageIcon,
};

function createAgentTile(
  id: string,
  input: AddTileInput,
  size: { w: number; h: number },
): RunTileSpec | Failure {
  const base = { id, rect: { x: 0, y: 0, ...size }, icon: ADDED_ICON[input.kind] };
  switch (input.kind) {
    case "note":
      return {
        ...base,
        title: input.title ?? "Note",
        subtitle: "Note · by an agent",
        content: {
          type: "note",
          source: {
            kind: "entity",
            entity: "note",
            id: null,
            ...(input.text ? { meta: { seed: input.text } } : {}),
          },
        },
      };
    case "markdown":
      if (!input.text) return { ok: false, error: "A markdown tile needs `text`." };
      return {
        ...base,
        title: input.title ?? "Write-up",
        subtitle: "Markdown · by an agent",
        content: { type: "markdown", text: input.text },
      };
    case "text":
      return {
        ...base,
        title: input.title ?? "Text",
        subtitle: "Label",
        content: { type: "text", text: input.text ?? input.title ?? "" },
      };
    case "html":
      if (input.html)
        return {
          ...base,
          title: input.title ?? "Page",
          subtitle: "Generated page · by an agent",
          content: { type: "html", srcDoc: input.html },
        };
      if (input.url)
        return {
          ...base,
          icon: Globe,
          title: input.title ?? "Page",
          subtitle: "Web page · sandboxed",
          content: { type: "html", src: input.url },
        };
      return { ok: false, error: "An html tile needs `html` (a complete document) or `url`." };
    case "image":
      if (!input.url) return { ok: false, error: "An image tile needs `url`." };
      return {
        ...base,
        title: input.title ?? "Image",
        subtitle: "Image",
        content: { type: "image", src: input.url },
      };
  }
}

function editAgentTile(tile: RunTileSpec, input: EditTileInput): Partial<RunTileSpec> | Failure {
  const c = tile.content;
  if (c.type === "step")
    return {
      ok: false,
      error: `"${tile.title}" is a step of this run — its content is the run's live result, so only its title and size change. Add a markdown tile beside it instead.`,
    };
  if (c.type === "note" && input.text !== undefined) {
    const seeded = noteSeedEdit(c.source, input.text);
    if (seeded) return { content: { type: "note", source: seeded } };
    return {
      ok: false,
      error: `"${tile.title}" is a real note in Notes. Change its text through the note itself: make the tile live (board_focus) and use its note_content write target.`,
    };
  }
  if (c.type === "markdown" && input.text !== undefined) return { content: { type: "markdown", text: input.text } };
  if (c.type === "text" && input.text !== undefined) return { content: { type: "text", text: input.text } };
  if (c.type === "html" && input.html !== undefined) return { content: { type: "html", srcDoc: input.html } };
  return {
    ok: false,
    error: `"${tile.title}" is a ${c.type} tile; that content cannot be replaced (only its title and size). Add a new tile instead.`,
  };
}

const ADDED_DONE: StatusFrom = { kind: "static", value: { status: "complete", progress: null } };
const ADDED_IDLE: StatusFrom = { kind: "static", value: { status: "idle", progress: null } };

/** A tile beside the run's steps — an agent's write-up, page, image, note or label. */
function AddedTile({
  spec,
  onMove,
  onResize,
  onThrow,
  onContent,
}: {
  spec: RunTileSpec;
  onMove: (id: string, x: number, y: number) => void;
  onResize: (id: string, rect: Rect) => void;
  onThrow: (id: string, direction: ThrowDirection) => void;
  onContent: (id: string, content: RunTileContent, title?: string) => void;
}) {
  const interacting = useIsEditing(spec.id);
  const c = spec.content;
  return (
    <BoardTile
      id={spec.id}
      rect={spec.rect}
      title={spec.title}
      subtitle={spec.subtitle}
      icon={spec.icon}
      statusFrom={c.type === "note" && !entityId(c.source) ? ADDED_IDLE : ADDED_DONE}
      onMove={onMove}
      onResize={onResize}
      onThrow={onThrow}
      throwActions={RUN_THROWS}
    >
      {(tier) => {
        switch (c.type) {
          case "markdown":
            return <MarkdownTileBody id={spec.id} text={c.text} tier={tier} />;
          case "html":
            return (
              <HtmlTileBody src={c.src} srcDoc={c.srcDoc} title={spec.title} tier={tier} active={interacting} />
            );
          case "image":
            return <ImageTileBody src={c.src} alt={spec.title} />;
          case "note":
            return (
              // Only the tile being worked in registers the notes surface.
              <TileSurfaceCapture id={spec.id} active={interacting}>
                <NoteItemBody
                  tileId={spec.id}
                  source={c.source}
                  title={spec.title}
                  tier={tier}
                  interacting={interacting}
                  onSource={(source, label) => onContent(spec.id, { type: "note", source }, label)}
                />
              </TileSurfaceCapture>
            );
          case "text":
            return <TextTileBody text={c.text} onChange={(text) => onContent(spec.id, { type: "text", text })} />;
          case "step":
            return null;
        }
      }}
    </BoardTile>
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
      data-board-chrome
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
  declaredKind,
  waitsFor,
  onMove,
  onResize,
  onThrow,
  ensureLane,
}: {
  runId: string;
  spec: RunTileSpec;
  declaredKind: string | null;
  waitsFor: string[];
  onMove: (id: string, x: number, y: number) => void;
  onResize: (id: string, rect: Rect) => void;
  onThrow: (id: string, direction: ThrowDirection) => void;
  ensureLane: EnsureLane;
}) {
  const value = useNodeStatus(runId, spec.id);
  const statusFrom: StatusFrom = { kind: "static", value };
  return (
    <BoardTile
      id={spec.id}
      rect={spec.rect}
      title={spec.title}
      subtitle={spec.subtitle}
      icon={spec.icon}
      statusFrom={statusFrom}
      onMove={onMove}
      onResize={onResize}
      onThrow={onThrow}
      throwActions={RUN_THROWS}
    >
      {(tier) => (
        <RunNodeBody
          runId={runId}
          nodeId={spec.id}
          tier={tier}
          declaredKind={declaredKind}
          waitsFor={waitsFor}
          ensureLane={ensureLane}
        />
      )}
    </BoardTile>
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
    <div data-board-scroll className="h-full space-y-2 overflow-y-auto overscroll-contain px-4 py-3 text-sm">
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
