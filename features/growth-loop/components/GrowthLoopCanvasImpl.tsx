"use client";

import { useState } from "react";
// eslint-disable-next-line no-restricted-syntax -- inside the GrowthLoopCanvas dynamic(ssr:false) front-door gate; React Flow stays STATIC in-gate per the code-splitting skill (rule 3).
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type EdgeProps,
  type EdgeTypes,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import {
  roundedOrthogonalPath,
  type DiagramPoint,
} from "@/features/canvas/edges/rounded-orthogonal-path";
import { cn } from "@/lib/utils";
import {
  EDGES,
  GAPS,
  PIPES,
  PIPE_LABEL,
  STAGES,
  edgeHealth,
  gapsAt,
  loopScore,
  type LoopEdge,
  type LoopStage,
  type Pipe,
  type PipeState,
} from "../map/loop-map";

/**
 * Boustrophedon layout, 4 columns x 3 rows. Deliberately squarer than a long
 * 6-wide strip: fitView then lands near 1:1 zoom, so the node text stays
 * READABLE instead of being shrunk to nothing on a normal screen.
 */
const COL = 376;
const ROW = 232;
const POSITIONS: Record<string, { x: number; y: number }> = {
  // row 0 →
  research: { x: 0, y: 0 },
  plan: { x: COL, y: 0 },
  brief: { x: COL * 2, y: 0 },
  realize: { x: COL * 3, y: 0 },
  // row 1 ←
  fill: { x: COL * 3, y: ROW },
  publish: { x: COL * 2, y: ROW },
  serve: { x: COL, y: ROW },
  crawl: { x: 0, y: ROW },
  // row 2 →
  measure: { x: 0, y: ROW * 2 },
  analyze: { x: COL, y: ROW * 2 },
  suggest: { x: COL * 2, y: ROW * 2 },
  writeback: { x: COL * 3, y: ROW * 2 },
};

type HandleSide = "top" | "right" | "bottom" | "left";
type OuterLane = "outer-left" | "outer-right";

interface EdgeRouteHandles {
  source: { side: HandleSide; offset: number };
  target: { side: HandleSide; offset: number };
}

type EdgeRoute = EdgeRouteHandles &
  (
    | { lane?: undefined; labelPoint?: undefined }
    | { lane: OuterLane; labelPoint: DiagramPoint }
  );

/**
 * Every connection owns both attachment points. Adding an edge without adding
 * its route is deliberately a loud render error: silently falling back to an
 * automatic handle is how stacked and node-crossing arrows returned before.
 */
const EDGE_ROUTES: Record<string, EdgeRoute> = {
  "research->plan": {
    source: { side: "right", offset: 50 },
    target: { side: "left", offset: 50 },
  },
  "plan->brief": {
    source: { side: "right", offset: 46 },
    target: { side: "left", offset: 46 },
  },
  "brief->realize": {
    source: { side: "right", offset: 50 },
    target: { side: "left", offset: 50 },
  },
  "realize->fill": {
    source: { side: "bottom", offset: 50 },
    target: { side: "top", offset: 50 },
  },
  "fill->publish": {
    source: { side: "left", offset: 48 },
    target: { side: "right", offset: 48 },
  },
  "publish->serve": {
    source: { side: "left", offset: 55 },
    target: { side: "right", offset: 55 },
  },
  "serve->crawl": {
    source: { side: "left", offset: 50 },
    target: { side: "right", offset: 50 },
  },
  "crawl->measure": {
    source: { side: "bottom", offset: 50 },
    target: { side: "top", offset: 50 },
  },
  "measure->analyze": {
    source: { side: "right", offset: 50 },
    target: { side: "left", offset: 50 },
  },
  "analyze->suggest": {
    source: { side: "right", offset: 36 },
    target: { side: "left", offset: 36 },
  },
  "suggest->writeback": {
    source: { side: "right", offset: 68 },
    target: { side: "left", offset: 68 },
  },
  "writeback->fill": {
    source: { side: "top", offset: 50 },
    target: { side: "bottom", offset: 50 },
  },
  "writeback->plan": {
    source: { side: "bottom", offset: 78 },
    target: { side: "top", offset: 74 },
    lane: "outer-right",
    labelPoint: { x: COL * 2.75, y: -116 },
  },
  "analyze->plan": {
    source: { side: "bottom", offset: 24 },
    target: { side: "top", offset: 26 },
    lane: "outer-left",
    labelPoint: { x: COL * 0.45, y: ROW * 2 + 176 },
  },
};

function routeFor(edgeId: string): EdgeRoute {
  const route = EDGE_ROUTES[edgeId];
  if (!route)
    throw new Error(
      `Growth Loop edge "${edgeId}" has no collision-safe route.`,
    );
  return route;
}

const HANDLE_POSITION: Record<HandleSide, Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
};

function handleStyle(
  side: HandleSide,
  offset: number,
): { left?: string; top?: string } {
  return side === "top" || side === "bottom"
    ? { left: `${offset}%` }
    : { top: `${offset}%` };
}

const PIPE_CLASSES: Record<PipeState, string> = {
  live: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40",
  partial:
    "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40",
  missing: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/40",
  "n/a": "bg-muted text-muted-foreground border-border",
};

const EDGE_STROKE: Record<PipeState, string> = {
  live: "hsl(160 84% 39%)",
  partial: "hsl(38 92% 50%)",
  missing: "hsl(347 77% 55%)",
  "n/a": "hsl(215 16% 47%)",
};

interface StageNodeData extends Record<string, unknown> {
  stage: LoopStage;
  openGaps: number;
  selected: boolean;
  related: boolean;
  dimmed: boolean;
}

function StageNode({ data }: NodeProps) {
  const { stage, openGaps, selected, related, dimmed } =
    data as unknown as StageNodeData;
  const incoming = EDGES.filter((edge) => edge.to === stage.id);
  const outgoing = EDGES.filter((edge) => edge.from === stage.id);
  return (
    <div
      className={cn(
                "w-[244px] cursor-pointer rounded-lg border bg-card px-3 py-2.5 shadow-sm transition-[border-color,box-shadow,opacity,background-color] duration-200",
        selected && "border-primary bg-primary/5 ring-2 ring-primary",
        related && "border-primary/70 bg-primary/5 ring-1 ring-primary/30",
        !selected && !related && "border-border hover:border-primary/50",
        dimmed && "opacity-40",
      )}
    >
      {incoming.map((edge) => {
        const handle = routeFor(edge.id).target;
        return (
          <Handle
            key={`target-${edge.id}`}
            id={`target-${edge.id}`}
            type="target"
            position={HANDLE_POSITION[handle.side]}
            style={handleStyle(handle.side, handle.offset)}
            className="!h-2 !w-2 !border-2 !border-card !bg-muted-foreground/60"
          />
        );
      })}
      <div className="flex items-start justify-between gap-2">
        <span className="text-[15px] font-semibold leading-tight text-foreground">
          {stage.label}
        </span>
        {openGaps > 0 && (
          <span className="shrink-0 rounded border border-rose-500/40 bg-rose-500/15 px-1.5 py-0.5 text-[11px] font-medium text-rose-700 dark:text-rose-300">
            {openGaps} gap{openGaps > 1 ? "s" : ""}
          </span>
        )}
      </div>
      <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
        {stage.blurb}
      </p>
      <div className="mt-2 flex gap-1.5">
        {PIPES.map((pipe) => (
          <span
            key={pipe}
            title={`${PIPE_LABEL[pipe]}: ${stage.pipes[pipe].note}`}
            className={cn(
              "flex-1 rounded border px-1 py-1 text-center text-[11px] font-medium",
              PIPE_CLASSES[stage.pipes[pipe].state],
            )}
          >
            {PIPE_LABEL[pipe]}
          </span>
        ))}
      </div>
      {outgoing.map((edge) => {
        const handle = routeFor(edge.id).source;
        return (
          <Handle
            key={`source-${edge.id}`}
            id={`source-${edge.id}`}
            type="source"
            position={HANDLE_POSITION[handle.side]}
            style={handleStyle(handle.side, handle.offset)}
            className="!h-2 !w-2 !border-2 !border-card !bg-muted-foreground/60"
          />
        );
      })}
    </div>
  );
}

const nodeTypes: NodeTypes = { stage: StageNode };

interface RoutedEdgeData extends Record<string, unknown> {
  lane: OuterLane;
  label: string;
  labelPoint: DiagramPoint;
  dimmed: boolean;
}

const OUTER_LEFT_X = -76;
const OUTER_RIGHT_X = COL * 3 + 244 + 76;
const OUTER_LEFT_TOP_Y = -72;
const OUTER_RIGHT_TOP_Y = -116;
const OUTER_LEFT_BOTTOM_Y = ROW * 2 + 176;
const OUTER_RIGHT_BOTTOM_Y = ROW * 2 + 224;

function RoutedEdge(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, style, markerEnd, data } =
    props;
  const routed = data as RoutedEdgeData;
  const points: DiagramPoint[] =
    routed.lane === "outer-left"
      ? [
          { x: sourceX, y: sourceY },
          { x: sourceX, y: OUTER_LEFT_BOTTOM_Y },
          { x: OUTER_LEFT_X, y: OUTER_LEFT_BOTTOM_Y },
          { x: OUTER_LEFT_X, y: OUTER_LEFT_TOP_Y },
          { x: targetX, y: OUTER_LEFT_TOP_Y },
          { x: targetX, y: targetY },
        ]
      : [
          { x: sourceX, y: sourceY },
          { x: sourceX, y: OUTER_RIGHT_BOTTOM_Y },
          { x: OUTER_RIGHT_X, y: OUTER_RIGHT_BOTTOM_Y },
          { x: OUTER_RIGHT_X, y: OUTER_RIGHT_TOP_Y },
          { x: targetX, y: OUTER_RIGHT_TOP_Y },
          { x: targetX, y: targetY },
        ];
  const { path } = roundedOrthogonalPath(points, 18);

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={style}
        interactionWidth={24}
      />
      <EdgeLabelRenderer>
        <div
          className={cn(
            "pointer-events-none absolute rounded bg-card/95 px-1.5 py-0.5 text-xs font-medium shadow-sm transition-opacity",
            routed.dimmed && "opacity-15",
          )}
          style={{
            transform: `translate(-50%, -50%) translate(${routed.labelPoint.x}px, ${routed.labelPoint.y}px)`,
            color: style?.stroke,
          }}
        >
          {routed.label}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const edgeTypes: EdgeTypes = { routed: RoutedEdge };

function PipeRow({
  pipe,
  state,
  note,
  refPath,
}: {
  pipe: Pipe;
  state: PipeState;
  note: string;
  refPath?: string;
}) {
  return (
    <div className="rounded border border-border bg-muted/40 p-2">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "rounded border px-1.5 py-0.5 text-[10px] font-medium",
            PIPE_CLASSES[state],
          )}
        >
          {PIPE_LABEL[pipe]}
        </span>
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {state}
        </span>
      </div>
      <p className="mt-1.5 text-xs leading-snug text-foreground">{note}</p>
      {refPath && (
        <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">
          {refPath}
        </p>
      )}
    </div>
  );
}

function GrowthLoopCanvasInner() {
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);

  const tracedEdgeIds = new Set(
    selectedStage
      ? EDGES.filter(
          (edge) => edge.from === selectedStage || edge.to === selectedStage,
        ).map((edge) => edge.id)
      : selectedEdge
        ? [selectedEdge]
        : [],
  );
  const relatedNodeIds = new Set<string>();
  for (const edge of EDGES) {
    if (!tracedEdgeIds.has(edge.id)) continue;
    relatedNodeIds.add(edge.from);
    relatedNodeIds.add(edge.to);
  }

  const hasSelection = selectedStage !== null || selectedEdge !== null;
  const nodes: Node[] = STAGES.map((stage) => ({
    id: stage.id,
    type: "stage",
    position: POSITIONS[stage.id] ?? { x: 0, y: 0 },
    data: {
      stage,
      openGaps: gapsAt(stage.id).length,
      selected: selectedStage === stage.id,
      related: selectedStage !== stage.id && relatedNodeIds.has(stage.id),
      dimmed: hasSelection && !relatedNodeIds.has(stage.id),
    } satisfies StageNodeData,
  }));

  const edges: Edge[] = EDGES.map((edge) => {
    const health = edgeHealth(edge);
    const stroke = EDGE_STROKE[health];
    const route = routeFor(edge.id);
    const traced = tracedEdgeIds.has(edge.id);
    const dimmed = hasSelection && !traced;
    return {
      id: edge.id,
      source: edge.from,
      target: edge.to,
      sourceHandle: `source-${edge.id}`,
      targetHandle: `target-${edge.id}`,
      label: route.lane ? undefined : edge.label,
      type: route.lane ? "routed" : "default",
      animated: traced || (!hasSelection && health === "live"),
      zIndex: traced ? 10 : 0,
      className: cn("transition-opacity duration-200", dimmed && "opacity-15"),
      style: {
        stroke,
        strokeWidth: traced ? 4 : 2.25,
        strokeDasharray: health === "missing" ? "7 5" : undefined,
        filter: traced ? `drop-shadow(0 0 5px ${stroke})` : undefined,
      },
      labelStyle: {
        fontSize: 12,
        fontWeight: 500,
        fill: stroke,
        opacity: dimmed ? 0.12 : 1,
      },
      labelBgStyle: { fill: "hsl(var(--card))", fillOpacity: 0.95 },
      labelBgPadding: [5, 3] as [number, number],
      labelBgBorderRadius: 4,
      markerEnd: { type: MarkerType.ArrowClosed, color: stroke },
      data: route.lane
        ? ({
            lane: route.lane,
            label: edge.label,
            labelPoint: route.labelPoint,
            dimmed,
          } satisfies RoutedEdgeData)
        : undefined,
    } satisfies Edge;
  });

  const onNodeClick = (_: unknown, node: Node) => {
    setSelectedEdge(null);
    setSelectedStage((current) => (current === node.id ? null : node.id));
  };

  const onEdgeClick = (_: unknown, edge: Edge) => {
    setSelectedStage(null);
    setSelectedEdge((current) => (current === edge.id ? null : edge.id));
  };

  const stage = selectedStage
    ? STAGES.find((s) => s.id === selectedStage)
    : undefined;
  const edge: LoopEdge | undefined = selectedEdge
    ? EDGES.find((e) => e.id === selectedEdge)
    : undefined;
  const score = loopScore();
  const openGaps = GAPS.filter((g) => g.status !== "closed");
  const blockers = openGaps.filter((g) => g.severity === "blocker");

  const detailGaps = stage
    ? gapsAt(stage.id)
    : edge
      ? GAPS.filter((g) => (edge.gaps ?? []).includes(g.id))
      : [];

  return (
    <div className="flex h-full w-full min-h-0">
      <div className="relative min-w-0 flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
          onPaneClick={() => {
            setSelectedStage(null);
            setSelectedEdge(null);
          }}
          fitView
          /* maxZoom 1 is the readability guarantee: fitView may zoom OUT to fit,
                       never IN past 1:1, and the map never renders below legible size. */
          fitViewOptions={{ padding: 0.22, maxZoom: 1 }}
          minZoom={0.4}
          maxZoom={1.75}
          proOptions={{ hideAttribution: true }}
          className="bg-textured"
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={18}
            size={1}
            className="!bg-transparent"
          />
          <Controls className="!border-border !bg-card" />
          <Panel
            position="top-left"
            className="rounded-md border border-border bg-card/95 px-3 py-2 shadow-sm"
          >
            <div className="text-xs font-semibold text-foreground">
              The Growth Loop
            </div>
            <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
              <span className="text-emerald-600 dark:text-emerald-400">
                {score.live} live
              </span>
              <span className="text-amber-600 dark:text-amber-400">
                {score.partial} partial
              </span>
              <span className="text-rose-600 dark:text-rose-400">
                {score.missing} missing
              </span>
              <span>of {score.total} connections</span>
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {openGaps.length} open gaps · {blockers.length} blockers
            </div>
            {/* No dead ends: the customer-facing view of this same map. */}
            <a
              href="/how-it-works"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block text-[11px] font-medium text-primary hover:underline"
            >
              Customer-facing view →
            </a>
          </Panel>
        </ReactFlow>
      </div>

      <aside className="w-[340px] shrink-0 overflow-y-auto border-l border-border bg-card p-3">
        {!stage && !edge && (
          <div className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Every step, three pipes
              </h2>
              <p className="mt-1 text-xs leading-snug text-muted-foreground">
                Each step of the loop should be runnable by code (free and
                automatic), by a person, or by an AI agent. A step that only
                works one way is still a gap. Click any box or arrow.
              </p>
            </div>
            <div className="space-y-1.5">
              {(["live", "partial", "missing"] as PipeState[]).map((state) => (
                <div key={state} className="flex items-center gap-2">
                  <span
                    className={cn(
                      "rounded border px-1.5 py-0.5 text-[10px] font-medium",
                      PIPE_CLASSES[state],
                    )}
                  >
                    {state}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {state === "live"
                      ? "works today, verified in code"
                      : state === "partial"
                        ? "exists but manual, unwired or incomplete"
                        : "nothing exists"}
                  </span>
                </div>
              ))}
            </div>
            <div>
              <h3 className="text-xs font-semibold text-foreground">
                Blockers
              </h3>
              <ul className="mt-1 space-y-1">
                {blockers.map((gap) => (
                  <li
                    key={gap.id}
                    className="text-[11px] leading-snug text-muted-foreground"
                  >
                    <span className="font-mono text-[10px] text-rose-600 dark:text-rose-400">
                      {gap.id}
                    </span>{" "}
                    {gap.title}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {stage && (
          <div className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                {stage.label}
              </h2>
              <p className="mt-1 text-xs leading-snug text-muted-foreground">
                {stage.blurb}
              </p>
              <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-muted-foreground">
                <span className="rounded border border-border px-1.5 py-0.5">
                  {stage.maturity}
                </span>
                {stage.repos.map((repo) => (
                  <span
                    key={repo}
                    className="rounded border border-border px-1.5 py-0.5"
                  >
                    {repo}
                  </span>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              {PIPES.map((pipe) => (
                <PipeRow
                  key={pipe}
                  pipe={pipe}
                  state={stage.pipes[pipe].state}
                  note={stage.pipes[pipe].note}
                  refPath={stage.pipes[pipe].ref}
                />
              ))}
            </div>
            <div>
              <h3 className="text-xs font-semibold text-foreground">Stores</h3>
              <ul className="mt-1 space-y-0.5">
                {stage.stores.map((store) => (
                  <li
                    key={store}
                    className="font-mono text-[10px] text-muted-foreground"
                  >
                    {store}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {edge && (
          <div className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                {edge.label}
              </h2>
              <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                {edge.id}
              </p>
            </div>
            <div className="space-y-1.5">
              {PIPES.map((pipe) => (
                <PipeRow
                  key={pipe}
                  pipe={pipe}
                  state={edge.pipes[pipe].state}
                  note={edge.pipes[pipe].note}
                  refPath={edge.pipes[pipe].ref}
                />
              ))}
            </div>
          </div>
        )}

        {detailGaps.length > 0 && (
          <div className="mt-3 space-y-1.5">
            <h3 className="text-xs font-semibold text-foreground">Gaps here</h3>
            {detailGaps.map((gap) => (
              <div
                key={gap.id}
                className="rounded border border-rose-500/30 bg-rose-500/5 p-2"
              >
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[10px] text-rose-600 dark:text-rose-400">
                    {gap.id}
                  </span>
                  <span className="text-[10px] uppercase text-muted-foreground">
                    {gap.severity}
                  </span>
                  <span className="ml-auto rounded border border-border px-1 text-[10px] text-muted-foreground">
                    {gap.lane}
                  </span>
                </div>
                <p className="mt-1 text-xs font-medium text-foreground">
                  {gap.title}
                </p>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                  {gap.detail}
                </p>
              </div>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}

export default function GrowthLoopCanvasImpl() {
  return (
    <ReactFlowProvider>
      <GrowthLoopCanvasInner />
    </ReactFlowProvider>
  );
}
