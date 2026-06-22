"use client";

/**
 * IngestFlowAnimation — in-tab visualization of the RAG write pipeline.
 *
 * Lives inside surfaces like the Files preview "Document" tab while a
 * file is being processed. Replaces the old "live progress in the corner"
 * placeholder with a beautiful, real-time pipeline visualization that
 * mirrors the marketing diagram users see at /rag/visualization.
 *
 * Driven by the streaming `useFileIngest` state — every node and edge
 * derives its visual state ("pending" / "active" / "complete") from the
 * current `ingest.progress.stage`, so the user sees exactly which step
 * the server is on right now.
 *
 * Layout: vertical pipeline (User file → Cloud file → Raw text → Clean
 * text → Chunks → Embeddings → Data Store) inside a constrained
 * ReactFlow canvas. Header shows file name + overall percent + progress
 * bar; footer shows live stage message + counter + Cancel/Reset/Close.
 *
 * Three terminal states are handled inside the same chassis:
 *   - error    → red banner with the error message + Retry / Dismiss
 *   - complete → green banner with chunk/embedding totals + Open / Close
 *   - cancel   → quietly resets via the parent's onClose
 */

import { useMemo } from "react";
import { RAG_VOCAB } from "@/features/rag/constants/vocabulary";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  type Node,
  type Edge,
  type NodeTypes,
  type EdgeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  CheckCircle2,
  Cloud,
  FileQuestion,
  FileText,
  Layers,
  Loader2,
  Stars,
  Upload,
  X as XIcon,
  AlertCircle,
  RotateCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  PipelineNode,
  type PipelineNodeData,
  type PipelineNodeVariant,
} from "./nodes/PipelineNode";
import { DataStoreNode, type DataStoreNodeData } from "./nodes/DataStoreNode";
import type { LucideIcon } from "lucide-react";
import {
  FlowEdge,
  type FlowEdgeData,
  type FlowEdgeLiveStats,
} from "./edges/FlowEdge";
import type { UseFileIngestState } from "@/features/rag/hooks/useFileIngest";
import type { IngestProgress, IngestResponse } from "@/features/rag/api/ingest";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface IngestHandle extends UseFileIngestState {
  run: (opts?: { force?: boolean }) => Promise<void>;
  runOnce: (opts?: { force?: boolean }) => Promise<void>;
  cancel: () => void;
  reset: () => void;
}

export interface IngestFlowAnimationProps {
  fileName: string;
  ingest: IngestHandle;
  /** Called when the user dismisses a terminal-state run (success/error). */
  onClose: () => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Stage mapping — turn the streaming `IngestProgress.stage` into a position
// along our 6-node pipeline. The 4 canonical pipeline stages each "produce"
// one of the bottom four nodes; "fetch" is rolled into "extract" since it
// happens before raw text exists.
// ---------------------------------------------------------------------------

type CanonicalStage = "extract" | "clean" | "chunk" | "embed" | "store";

/** Index of the node currently being produced. -1 = not started yet. */
const STAGE_TO_NODE_IDX: Record<CanonicalStage, number> = {
  // 0: user-file, 1: cloud-file, 2: raw-text, 3: clean-text, 4: chunks,
  // 5: embeddings, 6: data-store
  extract: 2,
  clean: 3,
  chunk: 4,
  embed: 5,
  store: 6,
};

function legacyToCanonical(s: IngestProgress["stage"]): CanonicalStage {
  switch (s) {
    case "fetch":
    case "extract":
      return "extract";
    case "cleanup":
      return "clean";
    case "chunk":
      return "chunk";
    case "embed":
      return "embed";
    case "upsert":
    case "complete":
      return "store";
    default:
      return "extract";
  }
}

// ---------------------------------------------------------------------------
// Static graph definition
// ---------------------------------------------------------------------------

// Layout sizing.
//
// The pipeline column itself is narrow and vertical. The rich live-stats
// card mounts to the RIGHT of every active edge (see `RICH_LABEL_OFFSET_X`
// in FlowEdge), so we deliberately reserve a wide right gutter via the
// `anchor-right` spacer node — that's what keeps fitView from squeezing
// the whole canvas into just the column and clipping the side card.
const COLUMN_X = 0;
const NODE_DY = 150;
const PIPELINE_NODE_W = 200; // default PipelineNode min-w
const STORE_NODE_W = 260; // default DataStoreNode min-w
/** How far past the column the right gutter extends, in graph units.
 *  Sized to accommodate the right card (FlowEdge SIDE_CARD_OFFSET_X 150
 *  + card width 220 + a bit of glow margin). */
const RIGHT_GUTTER_X = 500;
/** Symmetric left gutter for the left descriptive card. */
const LEFT_GUTTER_X = -300;

const NODE_IDS = [
  "user-file",
  "cloud-file",
  "raw-text",
  "clean-text",
  "chunks",
  "embeddings",
  "data-store",
] as const;

/**
 * Local mirror of the PipelineNodeData fields we want to specify in the
 * static graph. Mirrors the shape WITHOUT the `Record<string, unknown>`
 * index signature so spread/property access on it produces concrete
 * types instead of `unknown`.
 */
interface PipelineSpecPipe {
  variant: PipelineNodeVariant;
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  hideSource?: boolean;
  hideTarget?: boolean;
}

interface PipelineSpec {
  id: (typeof NODE_IDS)[number];
  pos: { x: number; y: number };
  pipeline?: PipelineSpecPipe;
}

const NODE_SPECS: PipelineSpec[] = [
  {
    id: "user-file",
    pos: { x: COLUMN_X, y: 0 },
    pipeline: {
      variant: "write",
      icon: Upload,
      title: "User file",
      subtitle: "PDF / DOCX / MD",
      hideTarget: true,
    },
  },
  {
    id: "cloud-file",
    pos: { x: COLUMN_X, y: NODE_DY },
    pipeline: {
      variant: "write",
      icon: Cloud,
      title: "Cloud file",
      subtitle: "stored object",
    },
  },
  {
    id: "raw-text",
    pos: { x: COLUMN_X, y: NODE_DY * 2 },
    pipeline: {
      variant: "write",
      icon: FileQuestion,
      title: "Raw text",
      subtitle: "messy extract",
    },
  },
  {
    id: "clean-text",
    pos: { x: COLUMN_X, y: NODE_DY * 3 },
    pipeline: {
      variant: "write",
      icon: FileText,
      title: "Clean text",
      subtitle: "structured markdown",
    },
  },
  {
    id: "chunks",
    pos: { x: COLUMN_X, y: NODE_DY * 4 },
    pipeline: {
      variant: "write",
      icon: Layers,
      title: RAG_VOCAB.segmentsShort,
      subtitle: "semantic windows",
    },
  },
  {
    id: "embeddings",
    pos: { x: COLUMN_X, y: NODE_DY * 5 },
    pipeline: {
      variant: "write",
      icon: Stars,
      title: "Embeddings",
      subtitle: "1536-d vectors",
    },
  },
  {
    id: "data-store",
    // Center the (wider) data store under the pipeline column.
    pos: {
      x: COLUMN_X + (PIPELINE_NODE_W - STORE_NODE_W) / 2,
      y: NODE_DY * 6 + 20,
    },
  },
];

interface EdgeSpec {
  id: string;
  source: (typeof NODE_IDS)[number];
  target: (typeof NODE_IDS)[number];
  targetHandle?: string;
  label: string;
  /** When this edge fires the active animation. */
  activeStage: CanonicalStage;
}

const EDGE_SPECS: EdgeSpec[] = [
  // user-file → cloud-file is conceptually the "upload"; treated as
  // already-done by the time the server starts streaming, so it never
  // gets the active animation, only completes once anything starts.
  {
    id: "e-upload",
    source: "user-file",
    target: "cloud-file",
    label: "upload",
    activeStage: "extract",
  },
  {
    id: "e-extract",
    source: "cloud-file",
    target: "raw-text",
    label: "extract",
    activeStage: "extract",
  },
  {
    id: "e-clean",
    source: "raw-text",
    target: "clean-text",
    label: "clean",
    activeStage: "clean",
  },
  {
    id: "e-chunk",
    source: "clean-text",
    target: "chunks",
    label: RAG_VOCAB.segmentStage,
    activeStage: "chunk",
  },
  {
    id: "e-embed",
    source: "chunks",
    target: "embeddings",
    label: "embed",
    activeStage: "embed",
  },
  {
    id: "e-store",
    source: "embeddings",
    target: "data-store",
    targetHandle: "in",
    label: "tagged by",
    activeStage: "store",
  },
];

const STAGE_ORDER: CanonicalStage[] = [
  "extract",
  "clean",
  "chunk",
  "embed",
  "store",
];

// ---------------------------------------------------------------------------
// Visual state derivation
// ---------------------------------------------------------------------------

interface VisualState {
  /** "complete" | "active" | "pending" per node id */
  nodeStates: Record<string, "pending" | "active" | "complete">;
  /** "complete" | "active" | "pending" per edge id */
  edgeStates: Record<string, "pending" | "active" | "complete">;
  storeState: "pending" | "ingesting" | "done";
}

function deriveState(ingest: IngestHandle): VisualState {
  const nodeStates: VisualState["nodeStates"] = {};
  const edgeStates: VisualState["edgeStates"] = {};
  for (const id of NODE_IDS) nodeStates[id] = "pending";
  for (const e of EDGE_SPECS) edgeStates[e.id] = "pending";

  // Done — everything green.
  if (ingest.status === "complete") {
    for (const id of NODE_IDS) nodeStates[id] = "complete";
    for (const e of EDGE_SPECS) edgeStates[e.id] = "complete";
    return { nodeStates, edgeStates, storeState: "done" };
  }

  // Error or idle without progress — leave everything pending; the
  // chassis above the canvas will surface the error/empty state.
  if (!ingest.progress) {
    if (ingest.status === "running") {
      // Starting — the very first node is "active" so the user can see
      // the system has accepted the work.
      nodeStates["user-file"] = "active";
    }
    return { nodeStates, edgeStates, storeState: "pending" };
  }

  const stage = legacyToCanonical(ingest.progress.stage);
  const stageIdx = STAGE_ORDER.indexOf(stage);
  const targetNodeIdx = STAGE_TO_NODE_IDX[stage];

  // Every node before the target is complete.
  for (let i = 0; i < targetNodeIdx; i++) {
    nodeStates[NODE_IDS[i]] = "complete";
  }
  // The target node is the one currently being produced.
  if (stage === "store") {
    nodeStates["data-store"] = "active";
  } else {
    nodeStates[NODE_IDS[targetNodeIdx]] = "active";
  }

  // Edges: derive state from the position of the edge's TARGET node
  // relative to the currently-active node. This naturally handles the
  // upload edge (target = cloud-file) which is conceptually finished
  // before the server starts streaming, and avoids two rich live-stat
  // cards rendering simultaneously when multiple edges happen to share
  // the same `activeStage` tag.
  for (const e of EDGE_SPECS) {
    const tgtIdx = NODE_IDS.indexOf(e.target);
    if (tgtIdx < targetNodeIdx) edgeStates[e.id] = "complete";
    else if (tgtIdx === targetNodeIdx) edgeStates[e.id] = "active";
    else edgeStates[e.id] = "pending";
  }

  return {
    nodeStates,
    edgeStates,
    storeState: stage === "store" ? "ingesting" : "pending",
  };
}

// ---------------------------------------------------------------------------
// Static type registries
// ---------------------------------------------------------------------------

/**
 * Invisible 1x1 node used purely so fitView extends the visible viewport
 * far enough horizontally for the off-edge live-stats cards to render.
 */
function SpacerNode() {
  return <div style={{ width: 1, height: 1, opacity: 0 }} aria-hidden />;
}

const nodeTypes: NodeTypes = {
  pipeline: PipelineNode,
  dataStore: DataStoreNode,
  spacer: SpacerNode,
};

const edgeTypes: EdgeTypes = {
  flow: FlowEdge,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function IngestFlowAnimation({
  fileName,
  ingest,
  onClose,
  className,
}: IngestFlowAnimationProps) {
  const visual = useMemo(() => deriveState(ingest), [ingest]);

  const nodes: Node[] = useMemo(() => {
    const verticalCenter = (NODE_DY * 6 + 20) / 2;
    const built: Node[] = NODE_SPECS.map((spec) => {
      if (spec.id === "data-store") {
        const data: DataStoreNodeData = {
          singleTopHandle: true,
          ingesting: visual.storeState === "ingesting",
          done: visual.storeState === "done",
        };
        return {
          id: spec.id,
          type: "dataStore",
          position: spec.pos,
          data: data as unknown as Record<string, unknown>,
          draggable: false,
          selectable: false,
        };
      }
      const nodeState = visual.nodeStates[spec.id];
      // Non-data-store specs always carry `pipeline`; assert it for TS.
      const pipe = spec.pipeline!;
      const data: PipelineNodeData = {
        variant: pipe.variant,
        icon: pipe.icon,
        title: pipe.title,
        subtitle: pipe.subtitle,
        hideSource: pipe.hideSource,
        hideTarget: pipe.hideTarget,
        active: nodeState === "active",
        complete: nodeState === "complete",
      };
      return {
        id: spec.id,
        type: "pipeline",
        position: spec.pos,
        data: data as unknown as Record<string, unknown>,
        draggable: false,
        selectable: false,
      };
    });

    // Invisible left + right anchors so fitView reserves the side gutters
    // where the rich live-stats card and any future left-side metrics will
    // mount. Without these, fitView clips the gutters and the card vanishes.
    built.push(
      {
        id: "anchor-left",
        type: "spacer",
        position: { x: LEFT_GUTTER_X, y: verticalCenter },
        data: {},
        draggable: false,
        selectable: false,
      },
      {
        id: "anchor-right",
        type: "spacer",
        position: { x: RIGHT_GUTTER_X, y: verticalCenter },
        data: {},
        draggable: false,
        selectable: false,
      },
    );

    return built;
  }, [visual]);

  // Build the per-active-edge live stats once per render so we don't
  // attach the same payload to edges that aren't currently active and
  // don't re-trigger the rich-card re-render when they go inactive.
  const activeStats: FlowEdgeLiveStats | null = useMemo(() => {
    if (ingest.status !== "running" || !ingest.progress) return null;
    const stage = legacyToCanonical(ingest.progress.stage);
    return {
      current: ingest.progress.current,
      total: ingest.progress.total,
      message: ingest.progress.message,
      units: STAGE_UNITS[stage],
      stageName: STAGE_GERUND[stage],
    };
  }, [ingest.status, ingest.progress]);

  const edges: Edge[] = useMemo(() => {
    return EDGE_SPECS.map((spec) => {
      const edgeState = visual.edgeStates[spec.id];
      const isActive = edgeState === "active";
      const data: FlowEdgeData = {
        variant: "write",
        label: spec.label,
        active: isActive,
        complete: edgeState === "complete",
        particleDuration: STAGE_PARTICLE_DUR[spec.activeStage],
        dashDuration: STAGE_DASH_DUR[spec.activeStage],
        liveStats: isActive && activeStats ? activeStats : undefined,
      };
      return {
        id: spec.id,
        type: "flow",
        source: spec.source,
        target: spec.target,
        targetHandle: spec.targetHandle,
        data: data as unknown as Record<string, unknown>,
        animated: false,
        selectable: false,
      };
    });
  }, [visual, activeStats]);

  // ---- header / footer derived data --------------------------------------

  const stageLabel = useMemo(() => {
    if (ingest.status === "complete") return "Complete";
    if (ingest.status === "error") return "Failed";
    if (!ingest.progress) return "Starting";
    const c = legacyToCanonical(ingest.progress.stage);
    return STAGE_LABELS[c];
  }, [ingest.status, ingest.progress]);

  const overallPercent = computeOverallPercent(ingest);
  const hasProgress = ingest.progress !== null;

  return (
    <div
      className={cn(
        "relative flex h-full w-full flex-col overflow-hidden bg-background",
        className,
      )}
    >
      {/* Local keyframes for the animated edge dashes */}
      <style>{`
        @keyframes ragFlowDash {
          to { stroke-dashoffset: -24; }
        }
      `}</style>

      {/* ─── Header ──────────────────────────────────────────────────────── */}
      <header className="shrink-0 border-b bg-card/40 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Processing for RAG
            </div>
            <div
              className="mt-0.5 text-sm font-medium truncate"
              title={fileName}
            >
              {fileName}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {stageLabel}
            </div>
            <div className="mt-0.5 text-xl font-bold tabular-nums leading-none">
              {overallPercent}
              <span className="text-xs font-medium text-muted-foreground">
                %
              </span>
            </div>
          </div>
        </div>
        {/* Overall progress bar — gradient travels left-to-right, reflects
            the cumulative stage progress (not just within-stage). */}
        <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-500 ease-out",
              ingest.status === "error"
                ? "bg-destructive"
                : ingest.status === "complete"
                  ? "bg-emerald-500"
                  : "bg-gradient-to-r from-cyan-500 via-violet-500 to-fuchsia-500",
            )}
            style={{ width: `${overallPercent}%` }}
          />
        </div>
      </header>

      {/* ─── Pipeline canvas ─────────────────────────────────────────────── */}
      <div className="relative min-h-0 flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.18, includeHiddenNodes: false }}
          minZoom={0.4}
          maxZoom={1.5}
          nodesDraggable={false}
          nodesConnectable={false}
          nodesFocusable={false}
          elementsSelectable={false}
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{ type: "flow" }}
          panOnScroll={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          panOnDrag={false}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1}
            className="opacity-30"
          />
        </ReactFlow>

        {/* Terminal-state overlays — sit ON TOP of the canvas with a soft
            backdrop so the pipeline (now all-green or stalled) is still
            visible behind. */}
        {ingest.status === "error" && (
          <div className="pointer-events-none absolute inset-x-4 bottom-4 z-10">
            <div className="pointer-events-auto rounded-xl border border-destructive/40 bg-background/95 p-3 shadow-lg backdrop-blur">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-destructive">
                    Processing failed
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground break-words">
                    {ingest.error ?? "The server returned an error."}
                  </div>
                  <div className="mt-2.5 flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => void ingest.run({ force: true })}
                    >
                      <RotateCw className="mr-1 h-3 w-3" />
                      Retry
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={onClose}
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {ingest.status === "complete" && ingest.result && (
          <div className="pointer-events-none absolute inset-x-4 bottom-4 z-10">
            <div className="pointer-events-auto rounded-xl border border-emerald-500/40 bg-background/95 p-3 shadow-lg backdrop-blur">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                    Indexed and ready
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground break-words">
                    {formatResultSummary(ingest.result)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── Footer ──────────────────────────────────────────────────────── */}
      <footer className="shrink-0 border-t bg-card/40 px-4 py-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            {ingest.status === "running" && (
              <Loader2 className="h-3 w-3 shrink-0 animate-spin text-primary" />
            )}
            {ingest.status === "complete" && (
              <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" />
            )}
            {ingest.status === "error" && (
              <AlertCircle className="h-3 w-3 shrink-0 text-destructive" />
            )}
            <span
              className="truncate text-xs text-muted-foreground"
              title={ingest.progress?.message ?? ""}
            >
              {ingest.status === "complete"
                ? "All stages complete."
                : ingest.status === "error"
                  ? "See error above."
                  : (ingest.progress?.message ??
                    (hasProgress ? "Working…" : "Connecting to the server…"))}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {hasProgress && (ingest.progress?.total ?? 0) > 0 && (
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {(ingest.progress?.current ?? 0).toLocaleString()} /{" "}
                {(ingest.progress?.total ?? 0).toLocaleString()}
              </span>
            )}
            {ingest.status === "running" ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[11px]"
                onClick={ingest.cancel}
              >
                <XIcon className="mr-1 h-3 w-3" />
                Cancel
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[11px]"
                onClick={onClose}
              >
                Close
              </Button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STAGE_LABELS: Record<CanonicalStage, string> = {
  extract: "Extract",
  clean: "Clean",
  chunk: RAG_VOCAB.segmentShort,
  embed: "Embed",
  store: "Index",
};

/**
 * Counter units per stage. The streaming backend emits stage-specific
 * counters (pages_done/total for extract & cleanup, chunks_done/total
 * for the rest), so we surface the human label that matches the units
 * actually flowing through the active edge.
 */
const STAGE_UNITS: Record<CanonicalStage, string> = {
  extract: "pages",
  clean: "pages",
  chunk: RAG_VOCAB.segmentsShort.toLowerCase(),
  embed: "embeddings",
  store: "vectors",
};

/**
 * Verb form shown on the left descriptive card ("CLEANING…").
 */
const STAGE_GERUND: Record<CanonicalStage, string> = {
  extract: "Extracting",
  clean: "Cleaning",
  chunk: RAG_VOCAB.segmenting,
  embed: "Embedding",
  store: "Indexing",
};

/**
 * Per-stage edge animation pacing. Earlier stages stay snappy; later
 * stages slow down so the user has time to read the rich numbers
 * panel as it updates. Tuple is `[particleDuration, dashDuration]`
 * in seconds — both feed straight into FlowEdge.
 */
const STAGE_PARTICLE_DUR: Record<CanonicalStage, number> = {
  extract: 1.2,
  clean: 1.6,
  chunk: 1.8,
  embed: 2.0,
  store: 2.0,
};
const STAGE_DASH_DUR: Record<CanonicalStage, number> = {
  extract: 0.9,
  clean: 1.2,
  chunk: 1.4,
  embed: 1.6,
  store: 1.6,
};

function computeOverallPercent(ingest: IngestHandle): number {
  if (ingest.status === "complete") return 100;
  if (ingest.status === "error" || !ingest.progress) return 0;

  const stage = legacyToCanonical(ingest.progress.stage);
  const stageIdx = STAGE_ORDER.indexOf(stage);
  const stageWeight = 1 / STAGE_ORDER.length; // 5 stages, 20% each
  const within =
    ingest.progress.total > 0
      ? Math.min(1, ingest.progress.current / ingest.progress.total)
      : 0;
  const overall = stageIdx * stageWeight + within * stageWeight;
  return Math.max(0, Math.min(99, Math.round(overall * 100)));
}

function formatResultSummary(r: IngestResponse): string {
  const chunks = r.chunks_written?.toLocaleString();
  const embeds = r.embeddings_written?.toLocaleString();
  const model = r.embedding_model;
  if (chunks && embeds && model) {
    return `${chunks} ${RAG_VOCAB.segmentsShort.toLowerCase()} · ${embeds} embeddings · ${model}`;
  }
  if (chunks)
    return `${chunks} ${RAG_VOCAB.segmentsShort.toLowerCase()} indexed`;
  return "Document indexed.";
}
