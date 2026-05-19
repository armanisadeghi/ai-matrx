"use client";

/**
 * RagFlowVisualization — animated story of how Matrx vector data stores work.
 *
 * Two parallel pipelines (READ on the left, WRITE on the right) flow toward
 * a glowing vector DATA STORE in the center, then top-K chunks emerge from
 * the bottom into the agent that completes the user's task.
 *
 *   READ PATH (left, violet)             WRITE PATH (right, cyan)
 *   ------------------------             -----------------------
 *   User task                            User file
 *      ↓ scan keywords                      ↓ upload
 *   RAG-likely?                          Cloud file
 *      ↓ inject tool                        ↓ extract
 *   Agent system                         Raw text
 *      ↓ call tool                          ↓ clean
 *   Search query                         Clean text
 *      ↓ embed query                        ↓ chunk
 *      \                                Chunks
 *       \                                  ↓ embed
 *        \                              Embeddings
 *         \                              /
 *          \  →  DATA STORE  ←          /  (vector index)
 *                    ↓ top-K chunks
 *              Agent completes task
 *
 * The orchestrator runs a single time-based cycle (~8.5s) using
 * requestAnimationFrame and only re-renders when the active node/edge
 * set actually changes. The `t` value resets and loops cleanly.
 */

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
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
  Brain,
  Cloud,
  FileQuestion,
  FileText,
  HelpCircle,
  Layers,
  ScanText,
  Search,
  Stars,
  Upload
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pause, Play, RotateCcw, Gauge } from "lucide-react";
import { cn } from "@/lib/utils";

import {
  PipelineNode,
  type PipelineNodeData,
  type PipelineNodeVariant,
} from "./nodes/PipelineNode";
import type { LucideIcon } from "lucide-react";
import { DataStoreNode, type DataStoreNodeData } from "./nodes/DataStoreNode";
import { OutputNode, type OutputNodeData } from "./nodes/OutputNode";
import { FlowEdge, type FlowEdgeData } from "./edges/FlowEdge";

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

const READ_X = 80;
const WRITE_X = 560;
const CENTER_DATA_X = 280;
const CENTER_OUT_X = 300;

// Read path nodes (4) — wider vertical spacing
const READ_Y = [40, 200, 360, 520];
// Write path nodes (6) — tighter spacing so its bottom aligns with read's bottom
const WRITE_Y = [40, 136, 232, 328, 424, 520];

const DATA_STORE_Y = 640;
const OUTPUT_Y = 830;

// ---------------------------------------------------------------------------
// Timeline (everything in ms; entities are "active" inside their window)
// ---------------------------------------------------------------------------

const CYCLE_MS = 8500;

interface Window {
  start: number;
  end: number;
}

const NODE_WINDOWS: Record<string, Window> = {
  // Read path
  "user-task": { start: 0, end: 5800 },
  "rag-likely": { start: 1200, end: 5800 },
  "agent-system": { start: 2400, end: 5800 },
  "search-query": { start: 3600, end: 6000 },

  // Write path
  "user-file": { start: 0, end: 5800 },
  "cloud-file": { start: 800, end: 5800 },
  "raw-text": { start: 1600, end: 5800 },
  "clean-text": { start: 2400, end: 5800 },
  chunks: { start: 3200, end: 5800 },
  embeddings: { start: 4000, end: 6000 },

  // Output
  output: { start: 6400, end: 8400 },
};

// Data store has its own state machine: idle → ingesting → querying/converging → output
const DATA_STORE_INTENSE: Window = { start: 4400, end: 7400 };

const EDGE_WINDOWS: Record<string, Window> = {
  // Read path edges
  "e-r1": { start: 200, end: 1500 },
  "e-r2": { start: 1400, end: 2700 },
  "e-r3": { start: 2600, end: 3900 },
  "e-r4": { start: 3800, end: 5600 },

  // Write path edges
  "e-w1": { start: 200, end: 1100 },
  "e-w2": { start: 1000, end: 1900 },
  "e-w3": { start: 1800, end: 2700 },
  "e-w4": { start: 2600, end: 3500 },
  "e-w5": { start: 3400, end: 4300 },
  "e-w6": { start: 4200, end: 5600 },

  // Output edge
  "e-out": { start: 5800, end: 7600 },
};

function isActive(t: number, w: Window): boolean {
  return t >= w.start && t <= w.end;
}

// ---------------------------------------------------------------------------
// Animation hook — efficient (only re-renders on active-set change)
// ---------------------------------------------------------------------------

interface AnimationState {
  activeNodes: Set<string>;
  activeEdges: Set<string>;
  storeIntense: boolean;
}

function computeState(t: number): AnimationState {
  const activeNodes = new Set<string>();
  for (const [k, w] of Object.entries(NODE_WINDOWS)) {
    if (isActive(t, w)) activeNodes.add(k);
  }
  const activeEdges = new Set<string>();
  for (const [k, w] of Object.entries(EDGE_WINDOWS)) {
    if (isActive(t, w)) activeEdges.add(k);
  }
  return {
    activeNodes,
    activeEdges,
    storeIntense: isActive(t, DATA_STORE_INTENSE),
  };
}

function setKey(s: Set<string>): string {
  return [...s].sort().join("|");
}

function useFlowAnimation(playing: boolean, speed: number) {
  const [state, setState] = useState<AnimationState>(() => computeState(0));
  const startRef = useRef<number | null>(null);
  const offsetRef = useRef(0); // accumulated animation time when paused

  useEffect(() => {
    if (!playing) {
      // freeze offset at last paused moment
      if (startRef.current !== null) {
        offsetRef.current = (performance.now() - startRef.current) * speed;
      }
      startRef.current = null;
      return;
    }

    let raf = 0;
    let lastNodeKey = setKey(state.activeNodes);
    let lastEdgeKey = setKey(state.activeEdges);
    let lastIntense = state.storeIntense;

    const baseStart = performance.now() - offsetRef.current / speed;
    startRef.current = baseStart;

    const tick = (now: number) => {
      const elapsed = (now - baseStart) * speed;
      const t = elapsed % CYCLE_MS;
      const next = computeState(t);
      const nKey = setKey(next.activeNodes);
      const eKey = setKey(next.activeEdges);
      if (
        nKey !== lastNodeKey ||
        eKey !== lastEdgeKey ||
        next.storeIntense !== lastIntense
      ) {
        lastNodeKey = nKey;
        lastEdgeKey = eKey;
        lastIntense = next.storeIntense;
        setState(next);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, speed]);

  const restart = useCallback(() => {
    offsetRef.current = 0;
    startRef.current = performance.now();
    setState(computeState(0));
  }, []);

  return { state, restart };
}

// ---------------------------------------------------------------------------
// Static graph definitions (positions + structure don't change; only data does)
// ---------------------------------------------------------------------------

/**
 * Local mirror of the PipelineNodeData fields we want to specify in the
 * static graph. Mirrors the shape WITHOUT the `Record<string, unknown>`
 * index signature so spread/property access produces concrete types.
 */
interface PipelineSpecPipe {
  variant: PipelineNodeVariant;
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  hideSource?: boolean;
  hideTarget?: boolean;
  complete?: boolean;
  compact?: boolean;
}

interface NodeSpec {
  id: string;
  type: "pipeline" | "dataStore" | "output";
  pos: { x: number; y: number };
  pipeline?: PipelineSpecPipe;
}

const NODE_SPECS: NodeSpec[] = [
  // READ path
  {
    id: "user-task",
    type: "pipeline",
    pos: { x: READ_X, y: READ_Y[0] },
    pipeline: {
      variant: "read",
      icon: HelpCircle,
      title: "User task",
      subtitle: "asks something",
      hideTarget: true,
    },
  },
  {
    id: "rag-likely",
    type: "pipeline",
    pos: { x: READ_X, y: READ_Y[1] },
    pipeline: {
      variant: "read",
      icon: ScanText,
      title: "RAG-likely?",
      subtitle: "classifier",
    },
  },
  {
    id: "agent-system",
    type: "pipeline",
    pos: { x: READ_X, y: READ_Y[2] },
    pipeline: {
      variant: "read",
      icon: Brain,
      title: "Agent system",
      subtitle: "tool calling",
    },
  },
  {
    id: "search-query",
    type: "pipeline",
    pos: { x: READ_X, y: READ_Y[3] },
    pipeline: {
      variant: "read",
      icon: Search,
      title: "Search query",
      subtitle: "what to retrieve",
    },
  },

  // WRITE path
  {
    id: "user-file",
    type: "pipeline",
    pos: { x: WRITE_X, y: WRITE_Y[0] },
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
    type: "pipeline",
    pos: { x: WRITE_X, y: WRITE_Y[1] },
    pipeline: {
      variant: "write",
      icon: Cloud,
      title: "Cloud file",
      subtitle: "stored object",
    },
  },
  {
    id: "raw-text",
    type: "pipeline",
    pos: { x: WRITE_X, y: WRITE_Y[2] },
    pipeline: {
      variant: "write",
      icon: FileQuestion,
      title: "Raw text",
      subtitle: "messy extract",
    },
  },
  {
    id: "clean-text",
    type: "pipeline",
    pos: { x: WRITE_X, y: WRITE_Y[3] },
    pipeline: {
      variant: "write",
      icon: FileText,
      title: "Clean text",
      subtitle: "structured markdown",
    },
  },
  {
    id: "chunks",
    type: "pipeline",
    pos: { x: WRITE_X, y: WRITE_Y[4] },
    pipeline: {
      variant: "write",
      icon: Layers,
      title: "Chunks",
      subtitle: "semantic windows",
    },
  },
  {
    id: "embeddings",
    type: "pipeline",
    pos: { x: WRITE_X, y: WRITE_Y[5] },
    pipeline: {
      variant: "write",
      icon: Stars,
      title: "Embeddings",
      subtitle: "1536-d vectors",
    },
  },

  // CENTER
  {
    id: "data-store",
    type: "dataStore",
    pos: { x: CENTER_DATA_X, y: DATA_STORE_Y },
  },
  {
    id: "output",
    type: "output",
    pos: { x: CENTER_OUT_X, y: OUTPUT_Y },
  },
];

interface EdgeSpec {
  id: string;
  source: string;
  target: string;
  targetHandle?: string;
  variant: FlowEdgeData["variant"];
  label: string;
  particleDuration?: number;
}

const EDGE_SPECS: EdgeSpec[] = [
  // Read path
  {
    id: "e-r1",
    source: "user-task",
    target: "rag-likely",
    variant: "read",
    label: "scan keywords",
    particleDuration: 1.1,
  },
  {
    id: "e-r2",
    source: "rag-likely",
    target: "agent-system",
    variant: "read",
    label: "inject tool",
    particleDuration: 1.1,
  },
  {
    id: "e-r3",
    source: "agent-system",
    target: "search-query",
    variant: "read",
    label: "call tool",
    particleDuration: 1.1,
  },
  {
    id: "e-r4",
    source: "search-query",
    target: "data-store",
    targetHandle: "in-read",
    variant: "read",
    label: "embed query",
    particleDuration: 1.4,
  },

  // Write path
  {
    id: "e-w1",
    source: "user-file",
    target: "cloud-file",
    variant: "write",
    label: "upload",
  },
  {
    id: "e-w2",
    source: "cloud-file",
    target: "raw-text",
    variant: "write",
    label: "extract",
  },
  {
    id: "e-w3",
    source: "raw-text",
    target: "clean-text",
    variant: "write",
    label: "clean",
  },
  {
    id: "e-w4",
    source: "clean-text",
    target: "chunks",
    variant: "write",
    label: "chunk",
  },
  {
    id: "e-w5",
    source: "chunks",
    target: "embeddings",
    variant: "write",
    label: "embed",
  },
  {
    id: "e-w6",
    source: "embeddings",
    target: "data-store",
    targetHandle: "in-write",
    variant: "write",
    label: "tagged by",
    particleDuration: 1.4,
  },

  // Output
  {
    id: "e-out",
    source: "data-store",
    target: "output",
    variant: "store",
    label: "top-K chunks",
    particleDuration: 1.6,
  },
];

// ---------------------------------------------------------------------------
// Static node/edge type registry (memoized once at module level)
// ---------------------------------------------------------------------------

const nodeTypes: NodeTypes = {
  pipeline: PipelineNode,
  dataStore: DataStoreNode,
  output: OutputNode,
};

const edgeTypes: EdgeTypes = {
  flow: FlowEdge,
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export interface RagFlowVisualizationProps {
  className?: string;
  /** When true, controls are visible; default true */
  showControls?: boolean;
  /** Initial play state; default true */
  autoPlay?: boolean;
}

const SPEEDS: { label: string; value: number }[] = [
  { label: "0.5×", value: 0.5 },
  { label: "1×", value: 1 },
  { label: "1.5×", value: 1.5 },
];

export function RagFlowVisualization({
  className,
  showControls = true,
  autoPlay = true,
}: RagFlowVisualizationProps) {
  const [playing, setPlaying] = useState(autoPlay);
  const [speedIdx, setSpeedIdx] = useState(1);
  const speed = SPEEDS[speedIdx].value;
  const { state, restart } = useFlowAnimation(playing, speed);

  const nodes: Node[] = useMemo(() => {
    return NODE_SPECS.map((spec) => {
      if (spec.type === "pipeline" && spec.pipeline) {
        const pipe = spec.pipeline;
        const data: PipelineNodeData = {
          variant: pipe.variant,
          icon: pipe.icon,
          title: pipe.title,
          subtitle: pipe.subtitle,
          hideSource: pipe.hideSource,
          hideTarget: pipe.hideTarget,
          compact: pipe.compact,
          complete: pipe.complete,
          active: state.activeNodes.has(spec.id),
        };
        return {
          id: spec.id,
          type: "pipeline",
          position: spec.pos,
          data: data as unknown as Record<string, unknown>,
          draggable: false,
          selectable: false,
        };
      }
      if (spec.type === "dataStore") {
        const data: DataStoreNodeData = {
          active: state.activeNodes.has(spec.id) || state.storeIntense,
          ingesting: state.storeIntense,
          querying: state.activeEdges.has("e-r4"),
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
      // output
      const data: OutputNodeData = {
        active: state.activeNodes.has(spec.id),
      };
      return {
        id: spec.id,
        type: "output",
        position: spec.pos,
        data: data as unknown as Record<string, unknown>,
        draggable: false,
        selectable: false,
      };
    });
  }, [state]);

  const edges: Edge[] = useMemo(() => {
    return EDGE_SPECS.map((spec) => {
      const data: FlowEdgeData = {
        variant: spec.variant,
        label: spec.label,
        active: state.activeEdges.has(spec.id),
        particleDuration: spec.particleDuration,
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
  }, [state]);

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-2xl border bg-background",
        "min-h-[640px] h-[min(90vh,920px)]",
        className,
      )}
    >
      {/* Keyframes for flowing dashes (used by FlowEdge) */}
      <style>{`
        @keyframes ragFlowDash {
          to { stroke-dashoffset: -24; }
        }
      `}</style>

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
        zoomOnPinch
        zoomOnDoubleClick={false}
        panOnDrag
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1.2}
          className="opacity-40"
        />
      </ReactFlow>

      {/* Floating legend */}
      <div className="pointer-events-none absolute left-4 top-4 flex flex-col gap-1.5 rounded-lg border bg-background/85 px-3 py-2 text-[11px] backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-violet-500 shadow-[0_0_8px_rgb(167_139_250)]" />
          <span className="text-muted-foreground">Read path</span>
          <span className="text-foreground/80">— what the agent asks</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-cyan-500 shadow-[0_0_8px_rgb(34_211_238)]" />
          <span className="text-muted-foreground">Write path</span>
          <span className="text-foreground/80">— how documents land</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgb(52_211_153)]" />
          <span className="text-muted-foreground">Retrieval</span>
          <span className="text-foreground/80">— top-K chunks back</span>
        </div>
      </div>

      {/* Controls */}
      {showControls && (
        <div className="absolute right-4 top-4 flex items-center gap-1 rounded-lg border bg-background/85 p-1 backdrop-blur">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? (
              <Pause className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={restart}
            aria-label="Restart"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
          <div className="mx-1 h-5 w-px bg-border" />
          <button
            type="button"
            onClick={() => setSpeedIdx((i) => (i + 1) % SPEEDS.length)}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium tabular-nums hover:bg-accent"
            aria-label="Cycle playback speed"
          >
            <Gauge className="h-3 w-3" />
            {SPEEDS[speedIdx].label}
          </button>
        </div>
      )}
    </div>
  );
}
