// features/agents/agent-sets/components/SetBuilderCanvasImpl.tsx
//
// THE heavy Agent Set builder canvas — the ONLY module allowed to import React
// Flow (@xyflow/react). It is reached exclusively through the SetBuilderCanvas
// dynamic({ ssr: false }) wrapper, so the flow runtime never lands in the route
// or server chunk. See the code-splitting skill + the reactFlowStaticImportBan in
// eslint.config.mjs.
//
// Renders the orchestrator as a hub node presiding over member nodes connected by
// animated edges. Agents are dragged in from the library rail (native DnD) and
// repositioned on the canvas; positions persist to each edge's metadata.

"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
// eslint-disable-next-line no-restricted-syntax -- The ONE sanctioned React Flow import; this module is loaded only via the SetBuilderCanvas next/dynamic({ ssr:false }) wrapper (code-splitting skill + reactFlowStaticImportBan).
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  Panel,
  Handle,
  Position,
  useReactFlow,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./set-builder-canvas.css";
import dagre from "dagre";
import { Network, Webhook, GitFork, CircleDot, LayoutGrid, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import {
  addAgentToSet,
  removeAgentFromSet,
  saveMemberMeta,
  saveSetConfig,
} from "@/features/agents/redux/agent-sets/thunks";
import { AgentRoleCard } from "./AgentRoleCard";
import { accentClasses } from "./accents";
import { AGENT_DND_MIME } from "./AgentLibraryRail";
import type { SetBuilderCanvasProps } from "./SetBuilderCanvas";
import type { SetAccent } from "../constants";

const ORCH_ID = "__orchestrator__";

interface OrchestratorData {
  agentId: string;
  accent: SetAccent;
  memberCount: number;
}
interface MemberData {
  orchestratorId: string;
  agentId: string;
  accent: SetAccent;
  index: number;
  roleTitle: string | null;
  gap: string | null;
  onEdit: (agentId: string) => void;
}

// ─── nodes ──────────────────────────────────────────────────────────────

function OrchestratorNode({ data }: NodeProps) {
  // MATRX-EXCEPTION: React Flow's NodeProps.data is generically typed
  // Record<string, unknown> (the library's node-data bag); it has no index
  // signature overlap with our concrete OrchestratorData, so the two-step
  // cast is required. The shape is set by this file's own `nodes` builder
  // below, so it's safe.
  const d = data as unknown as OrchestratorData;
  const a = accentClasses(d.accent);
  const agent = useAppSelector((s) => selectAgentById(s, d.agentId));
  return (
    <div
      className={cn(
        "w-[260px] rounded-2xl border-2 bg-card p-4 shadow-lg",
        "border-transparent ring-2",
        a.ring,
      )}
    >
      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !border-0 !bg-transparent" />
      <div className="flex items-center gap-3">
        <div className={cn("flex h-11 w-11 items-center justify-center rounded-xl shadow-sm", a.glyph)}>
          <Network className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className={cn("text-[10px] font-bold uppercase tracking-wide", a.text)}>
            Orchestrator
          </div>
          <div className="truncate text-sm font-semibold text-foreground" title={agent?.name}>
            {agent?.name ?? "Orchestrator"}
          </div>
        </div>
      </div>
      <p className="mt-2 line-clamp-2 text-xs leading-snug text-muted-foreground">
        {agent?.description ?? "Presides over this set of agents."}
      </p>
      <div className="mt-2.5 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <Webhook className="h-3 w-3" />
        Coordinates {d.memberCount} {d.memberCount === 1 ? "agent" : "agents"}
      </div>
    </div>
  );
}

function MemberNode({ data }: NodeProps) {
  // MATRX-EXCEPTION: same React Flow generic-data-bag cast as OrchestratorNode.
  const d = data as unknown as MemberData;
  const dispatch = useAppDispatch();
  const a = accentClasses(d.accent);
  return (
    <div className="relative">
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !border-0 !bg-transparent" />
      <AgentRoleCard
        agentId={d.agentId}
        roleTitle={d.roleTitle}
        gap={d.gap}
        accent={d.accent}
        index={d.index}
        variant="node"
        onEdit={() => d.onEdit(d.agentId)}
        onRemove={() =>
          dispatch(removeAgentFromSet({ orchestratorId: d.orchestratorId, agentId: d.agentId }))
        }
      />
      <span className={cn("pointer-events-none absolute -inset-px rounded-xl ring-1", a.ring)} />
    </div>
  );
}

const nodeTypes: NodeTypes = {
  orchestrator: OrchestratorNode,
  member: MemberNode,
};

// ─── layout ─────────────────────────────────────────────────────────────

function defaultMemberPos(index: number, total: number): { x: number; y: number } {
  const cols = Math.min(Math.max(total, 1), 4);
  const col = index % cols;
  const row = Math.floor(index / cols);
  const spanX = 300;
  const startX = -((cols - 1) * spanX) / 2;
  return { x: startX + col * spanX, y: 260 + row * 230 };
}

type LayoutKind = "hierarchy" | "radial" | "grid";
type XY = { x: number; y: number };
interface LayoutResult {
  orch: XY;
  members: Record<string, XY>;
}

const ORCH_W = 260;
const ORCH_H = 150;
const MEM_W = 244;
const MEM_H = 132;

/** Compute a fresh position for every node under one of the auto-arrange modes. */
function computeLayout(kind: LayoutKind, memberIds: string[]): LayoutResult {
  const n = memberIds.length;

  if (kind === "grid") {
    const members: Record<string, XY> = {};
    memberIds.forEach((id, i) => (members[id] = defaultMemberPos(i, n)));
    return { orch: { x: -ORCH_W / 2, y: -40 }, members };
  }

  if (kind === "radial") {
    const members: Record<string, XY> = {};
    const R = Math.max(340, n * 48);
    memberIds.forEach((id, i) => {
      const ang = (2 * Math.PI * i) / Math.max(n, 1) - Math.PI / 2;
      members[id] = { x: Math.cos(ang) * R - MEM_W / 2, y: Math.sin(ang) * R - MEM_H / 2 };
    });
    return { orch: { x: -ORCH_W / 2, y: -ORCH_H / 2 }, members };
  }

  // hierarchy — dagre top-down tree (orchestrator over its members)
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: 44, ranksep: 90, marginx: 24, marginy: 24 });
  g.setDefaultEdgeLabel(() => ({}));
  g.setNode(ORCH_ID, { width: ORCH_W, height: ORCH_H });
  memberIds.forEach((id) => g.setNode(id, { width: MEM_W, height: MEM_H }));
  memberIds.forEach((id) => g.setEdge(ORCH_ID, id));
  dagre.layout(g);
  const on = g.node(ORCH_ID);
  const members: Record<string, XY> = {};
  memberIds.forEach((id) => {
    const dn = g.node(id);
    members[id] = { x: dn.x - MEM_W / 2, y: dn.y - MEM_H / 2 };
  });
  return { orch: { x: on.x - ORCH_W / 2, y: on.y - ORCH_H / 2 }, members };
}

function LayoutButton({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Auto-arrange: ${label}`}
      className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

// ─── canvas ─────────────────────────────────────────────────────────────

function CanvasInner({ orchestratorId, accent, members, config, onEditMember }: SetBuilderCanvasProps) {
  const dispatch = useAppDispatch();
  const { screenToFlowPosition, fitView } = useReactFlow();
  const a = accentClasses(accent);

  // Build the RF node list from props, preserving the live position + z-order of
  // nodes that already exist (so a drag or bring-to-front survives a reconcile).
  const buildNodes = useCallback(
    (prev: Node[] = []): Node[] => {
      const prevById = new Map(prev.map((n) => [n.id, n]));
      const op = prevById.get(ORCH_ID);
      const orch: Node = {
        id: ORCH_ID,
        type: "orchestrator",
        position: op?.position ?? config.orchestratorPos ?? { x: 0, y: 0 },
        zIndex: op?.zIndex,
        data: {
          agentId: orchestratorId,
          accent,
          memberCount: members.length,
        } as Record<string, unknown>,
      };
      const memberNodes: Node[] = members.map((m, i) => {
        const p = prevById.get(m.agentId);
        return {
          id: m.agentId,
          type: "member",
          position: p?.position ?? m.pos ?? defaultMemberPos(i, members.length),
          zIndex: p?.zIndex,
          data: {
            orchestratorId,
            agentId: m.agentId,
            accent,
            index: i + 1,
            roleTitle: m.roleTitle,
            gap: m.gap,
            onEdit: onEditMember,
          } as Record<string, unknown>,
        };
      });
      return [orch, ...memberNodes];
    },
    [members, config.orchestratorPos, accent, orchestratorId, onEditMember],
  );

  // React Flow OWNS node state — a drag mutates only the dragged node (no
  // whole-graph re-render, which was the bug). External (Redux) changes are
  // pushed in by the reconcile effect below, keyed on a content signature (NOT
  // every `members` ref change), so persisting a dragged position never rebuilds.
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(buildNodes());
  const [edges, setEdges] = useEdgesState<Edge>([]);
  const zSeq = useRef(1);

  const sig = useMemo(
    () =>
      members.map((m) => `${m.agentId}:${m.roleTitle ?? ""}:${m.gap ?? ""}`).join("|") +
      `#${accent}#${JSON.stringify(config.orchestratorPos ?? null)}`,
    [members, accent, config.orchestratorPos],
  );

  useEffect(() => {
    // Sync external membership/label/accent changes into RF-owned state, keyed on
    // `sig`, preserving live positions/z-order. See buildNodes note above.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNodes((cur) => buildNodes(cur));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEdges(
      members.map((m) => ({
        id: `e-${m.agentId}`,
        source: ORCH_ID,
        target: m.agentId,
        animated: true,
        type: "smoothstep",
        style: { stroke: a.stroke, strokeWidth: 2 },
      })),
    );
  }, [sig]);

  /** Raise a node above the rest (most-recently-active on top). Only that node's
   *  object changes, so no other node re-renders. Fires on click / drag-start. */
  const bringToFront = useCallback(
    (id: string) => {
      zSeq.current += 1;
      const z = zSeq.current;
      setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, zIndex: z } : n)));
    },
    [setNodes],
  );

  const onNodeDragStop = useCallback(
    (_e: unknown, node: Node) => {
      if (node.id === ORCH_ID) {
        dispatch(
          saveSetConfig({
            orchestratorId,
            config: { ...config, orchestratorPos: { x: node.position.x, y: node.position.y } },
          }),
        );
      } else {
        const m = members.find((x) => x.agentId === node.id);
        dispatch(
          saveMemberMeta({
            orchestratorId,
            agentId: node.id,
            meta: {
              roleTitle: m?.roleTitle ?? undefined,
              gap: m?.gap ?? undefined,
              pos: { x: node.position.x, y: node.position.y },
            },
          }),
        );
      }
    },
    [dispatch, orchestratorId, config, members],
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const agentId = event.dataTransfer.getData(AGENT_DND_MIME);
      if (!agentId || agentId === orchestratorId) return;
      if (members.some((m) => m.agentId === agentId)) return;
      const pos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      dispatch(addAgentToSet({ orchestratorId, agentId, meta: { pos } }));
    },
    [dispatch, orchestratorId, members, screenToFlowPosition],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  // Auto-arrange: recompute every node's position, snap instantly (overrides),
  // persist (per-member pos + orchestrator pos), then frame the graph.
  const applyLayout = useCallback(
    (kind: LayoutKind) => {
      const layout = computeLayout(kind, members.map((m) => m.agentId));
      setNodes((nds) =>
        nds.map((n) =>
          n.id === ORCH_ID
            ? { ...n, position: layout.orch }
            : layout.members[n.id]
              ? { ...n, position: layout.members[n.id] }
              : n,
        ),
      );
      dispatch(saveSetConfig({ orchestratorId, config: { ...config, orchestratorPos: layout.orch } }));
      members.forEach((m) =>
        dispatch(
          saveMemberMeta({ orchestratorId, agentId: m.agentId, meta: { pos: layout.members[m.agentId] } }),
        ),
      );
      // Frame after the position change has painted.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => fitView({ padding: 0.25, maxZoom: 1, duration: 400 })),
      );
    },
    [members, dispatch, orchestratorId, config, fitView, setNodes],
  );

  return (
    <div className="h-full w-full" onDrop={onDrop} onDragOver={onDragOver}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStart={(_e, node) => bringToFront(node.id)}
        onNodeClick={(_e, node) => bringToFront(node.id)}
        onNodeDragStop={onNodeDragStop}
        nodesConnectable={false}
        edgesFocusable={false}
        deleteKeyCode={null}
        fitView
        fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
        proOptions={{ hideAttribution: true }}
        className="agent-set-flow bg-textured"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} className="opacity-50" />
        <Controls showInteractive={false} className="!shadow-md" />
        <Panel position="top-right">
          <div className="flex items-center gap-0.5 rounded-lg border border-border bg-card/90 p-0.5 shadow-md backdrop-blur">
            <span className="px-1.5 text-[11px] font-medium text-muted-foreground">Arrange</span>
            <LayoutButton icon={GitFork} label="Hierarchy" onClick={() => applyLayout("hierarchy")} />
            <LayoutButton icon={CircleDot} label="Radial" onClick={() => applyLayout("radial")} />
            <LayoutButton icon={LayoutGrid} label="Grid" onClick={() => applyLayout("grid")} />
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}

export default function SetBuilderCanvasImpl(props: SetBuilderCanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
