// features/agents/orchestras/components/OrchestraBuilderCanvasImpl.tsx
//
// THE heavy Orchestra builder canvas — the ONLY module allowed to import React
// Flow (@xyflow/react). It is reached exclusively through the OrchestraBuilderCanvas
// dynamic({ ssr: false }) wrapper, so the flow runtime never lands in the route
// or server chunk. See the code-splitting skill + the reactFlowStaticImportBan in
// eslint.config.mjs.
//
// Renders the conductor as a hub node presiding over member nodes connected by
// solid edges (dashed is reserved for manual org chart links). Agents are dragged in from the library rail (native DnD) and
// repositioned on the canvas; positions persist to each edge's metadata.

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
// eslint-disable-next-line no-restricted-syntax -- The ONE sanctioned React Flow import; this module is loaded only via the OrchestraBuilderCanvas next/dynamic({ ssr:false }) wrapper (code-splitting skill + reactFlowStaticImportBan).
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
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./orchestra-builder-canvas.css";
import dagre from "dagre";
import { Network, Webhook, GitFork, CircleDot, LayoutGrid, Loader2, PanelRight, ChevronDown, ChevronUp, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import {
  addAgentToOrchestra,
  removeAgentFromOrchestra,
  saveMemberMeta,
  saveOrchestraConfig,
} from "@/features/agents/redux/orchestras/thunks";
import { AgentRoleCard } from "./AgentRoleCard";
import { AgentPeekButton } from "./AgentPeekButton";
import { useMemberRunState } from "../run/OrchestraRunStatusContext";
import { accentClasses } from "./accents";
import { AGENT_DND_MIME } from "./AgentLibraryRail";
import type { OrchestraBuilderCanvasProps } from "./OrchestraBuilderCanvas";
import type { OrchestraAccent } from "../constants";
import { useAgentOrgChart } from "@/features/agents/org-chart/useAgentOrgChart";
import { AGENT_ORG_EDGE_KINDS } from "@/features/agents/org-chart/constants";
import type { AgentOrgNodeData } from "@/features/agents/org-chart/buildAgentOrgForest";
import { AgentOrgCard } from "@/features/agents/org-chart/components/AgentOrgCard";
import {
  DEFAULT_ORG_CHART_LAYOUT,
  layoutOrgForest,
  countDescendants,
  type OrgChartTreeNode,
  type PlacedOrgNode,
} from "@/components/official/org-chart/layout";

const ORCH_ID = "__conductor__";

interface ConductorData {
  agentId: string;
  accent: OrchestraAccent;
  memberCount: number;
  onOpen: () => void;
}
interface MemberData {
  conductorId: string;
  agentId: string;
  accent: OrchestraAccent;
  index: number;
  roleTitle: string | null;
  gap: string | null;
  onEdit: (agentId: string) => void;
  /** Agents under this member (it leads an Orchestra, or has manual reports). */
  teamSize: number;
  teamCollapsed: boolean;
  onToggleTeam: (agentId: string) => void;
}
interface NestedData {
  placed: PlacedOrgNode<AgentOrgNodeData>;
  memberCount?: number;
}

// ─── nodes ──────────────────────────────────────────────────────────────

function ConductorNode({ data }: NodeProps) {
  // MATRX-EXCEPTION: React Flow's NodeProps.data is generically typed
  // Record<string, unknown> (the library's node-data bag); it has no index
  // signature overlap with our concrete ConductorData, so the two-step
  // cast is required. The shape is set by this file's own `nodes` builder
  // below, so it's safe.
  const d = data as unknown as ConductorData;
  const a = accentClasses(d.accent);
  const agent = useAppSelector((s) => selectAgentById(s, d.agentId));
  return (
    <div
      className={cn(
        "group/orch relative w-[260px] rounded-2xl border-2 bg-card p-4 shadow-lg",
        "border-transparent ring-2",
        a.ring,
      )}
    >
      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !border-0 !bg-transparent" />
      {/* Hover toolbar — mirrors the member card: Quick-look snapshot + open the
          side inspector (details + system prompt). */}
      <div className="absolute right-1.5 top-1.5 z-10 flex items-center gap-0.5 rounded-md bg-card/85 opacity-0 backdrop-blur transition-opacity group-hover/orch:opacity-100">
        <AgentPeekButton agentId={d.agentId} />
        <button
          type="button"
          aria-label="Conductor details"
          title="Conductor details"
          onClick={(e) => {
            e.stopPropagation();
            d.onOpen();
          }}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <PanelRight className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex items-center gap-3">
        <div className={cn("flex h-11 w-11 items-center justify-center rounded-xl shadow-sm", a.glyph)}>
          <Network className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className={cn("text-[10px] font-bold uppercase tracking-wide", a.text)}>
            Conductor
          </div>
          <div className="truncate text-sm font-semibold text-foreground" title={agent?.name}>
            {agent?.name ?? "Conductor"}
          </div>
        </div>
      </div>
      <p className="mt-2 line-clamp-2 text-xs leading-snug text-muted-foreground">
        {agent?.description ?? "Presides over this Orchestra."}
      </p>
      <div className="mt-2.5 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <Webhook className="h-3 w-3" />
        Coordinates {d.memberCount} {d.memberCount === 1 ? "agent" : "agents"}
      </div>
    </div>
  );
}

function MemberNode({ data }: NodeProps) {
  // MATRX-EXCEPTION: same React Flow generic-data-bag cast as ConductorNode.
  const d = data as unknown as MemberData;
  const dispatch = useAppDispatch();
  const a = accentClasses(d.accent);
  // Live run state comes from context, NEVER through node `data` — pushing
  // volatile status through data would churn the sig-keyed reconcile.
  const runState = useMemberRunState(d.agentId);
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
          dispatch(removeAgentFromOrchestra({ conductorId: d.conductorId, agentId: d.agentId }))
        }
      />
      {/* idle = the Orchestra's accent ring; running = animated accent pulse; done /
          failed = success / destructive rings until the next turn resets. */}
      <span
        className={cn(
          "pointer-events-none absolute -inset-px rounded-xl",
          runState === "running" && cn("animate-pulse ring-2 shadow-lg", a.ring),
          runState === "done" && "ring-2 ring-emerald-500/80 dark:ring-emerald-400/80",
          runState === "failed" && "ring-2 ring-destructive/80",
          runState === null && cn("ring-1", a.ring),
        )}
      />
      {runState === "running" && (
        <span className="absolute -right-1.5 -top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card shadow-sm">
          <Loader2 className={cn("h-3 w-3 animate-spin", a.text)} />
        </span>
      )}
      {d.teamSize > 0 && (
        <>
          <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !border-0 !bg-transparent" />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              d.onToggleTeam(d.agentId);
            }}
            title={d.teamCollapsed ? `Show the ${d.teamSize} agents under this one` : "Hide its team"}
            className="nodrag absolute left-1/2 top-full z-10 flex h-6 -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full border border-border bg-card px-2 text-[11px] font-semibold text-muted-foreground shadow-sm transition-colors hover:border-foreground/30 hover:text-foreground"
          >
            {d.teamCollapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
            Team of {d.teamSize}
          </button>
        </>
      )}
    </div>
  );
}

/** A read-only box for an agent inside a nested Orchestra (or placed under a member by hand). */
function NestedNode({ data }: NodeProps) {
  // MATRX-EXCEPTION: same React Flow generic-data-bag cast as ConductorNode.
  const d = data as unknown as NestedData;
  return (
    <div style={{ width: NEST_W, height: NEST_H }}>
      <Handle id="top" type="target" position={Position.Top} className="!h-2 !w-2 !border-0 !bg-transparent" />
      {/* Stacked teams hang off a trunk, so their links arrive from the side. */}
      <Handle id="left" type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-transparent" />
      <Handle id="right" type="target" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-transparent" />
      <AgentOrgCard
        node={d.placed}
        state={{ selected: false, matched: false, select: () => {} }}
        memberCount={d.memberCount}
        readOnly
      />
      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !border-0 !bg-transparent" />
    </div>
  );
}

const nodeTypes: NodeTypes = {
  conductor: ConductorNode,
  member: MemberNode,
  nested: NestedNode,
};

const NEST_W = DEFAULT_ORG_CHART_LAYOUT.cardWidth;
const NEST_H = DEFAULT_ORG_CHART_LAYOUT.cardHeight;
/** Gap between a member card's bottom and its team's first row. */
const NEST_DROP = 72;

interface NestedGraph {
  nodes: Node[];
  edges: Edge[];
  /** Width each member's expanded team needs (Hierarchy arrange reserves it). */
  widths: Record<string, number>;
  /** Height below the member card each expanded team takes (rows are spaced for it). */
  heights: Record<string, number>;
  teamSize: Record<string, number>;
  sig: string;
}

/**
 * Lay out every member's own team (a nested Orchestra and/or agents placed
 * under it by hand) as read-only nodes parented to the member node, so a drag
 * of the member carries its whole team. Uses the shared org chart layout, so
 * the team looks exactly like it does on the Org chart view.
 */
function buildNestedGraph(
  root: OrgChartTreeNode<AgentOrgNodeData> | undefined,
  memberIds: Set<string>,
  collapsed: Set<string>,
  memberCounts: Map<string, number>,
  rootAccent: OrchestraAccent,
): NestedGraph {
  const out: NestedGraph = { nodes: [], edges: [], widths: {}, heights: {}, teamSize: {}, sig: "" };
  if (!root) return out;
  const sig: string[] = [];
  const accentOf = new Map<string, OrchestraAccent>();
  for (const member of root.children) {
    const memberId = member.data.agentId;
    if (!memberIds.has(memberId) || member.children.length === 0) continue;
    out.teamSize[memberId] = countDescendants(member);
    sig.push(`${memberId}:${out.teamSize[memberId]}:${collapsed.has(memberId) ? 1 : 0}`);
    if (collapsed.has(memberId)) continue;
    // Lay the member out WITH its team, exactly as the Org chart view does
    // (stacked columns included), then hang everything but the member itself
    // off the member node.
    const layout = layoutOrgForest([member], {
      ...DEFAULT_ORG_CHART_LAYOUT,
      padding: 0,
      collapsed: new Set(),
    });
    const self = layout.nodes[0];
    const team = layout.nodes.slice(1);
    out.widths[memberId] = layout.width;
    out.heights[memberId] = layout.height - NEST_H;
    // Centre on the member card (MEM_W wide, MEM_H tall on this canvas).
    const offsetX = MEM_W / 2 - (self.x + NEST_W / 2);
    const offsetY = MEM_H - (self.y + NEST_H);
    const idOf = (key: string) => `nested:${key}`;
    accentOf.set(member.key, member.data.accent ?? rootAccent);
    for (const n of team) {
      accentOf.set(n.key, n.node.data.accent ?? accentOf.get(n.parentKey ?? member.key) ?? rootAccent);
      out.nodes.push({
        id: idOf(n.key),
        type: "nested",
        parentId: memberId,
        position: { x: n.x + offsetX, y: n.y + offsetY },
        draggable: false,
        selectable: false,
        data: { placed: n, memberCount: memberCounts.get(n.node.data.agentId) } as unknown as Record<string, unknown>,
      });
      const nd = n.node.data;
      sig.push(
        [n.key, nd.pending, nd.unavailable, nd.accent, nd.mode, nd.edgeKind, nd.otherPlacements, nd.loop, nd.roleTitle, memberCounts.get(nd.agentId)].join(":"),
      );
    }
    const placedByKey = new Map(layout.nodes.map((n) => [n.key, n]));
    for (const n of team) {
      const parentKey = n.parentKey ?? member.key;
      const manual = n.edgeKind === "manual";
      const parent = placedByKey.get(parentKey);
      // Same test the shared layout uses: siblings side by side in one row = a
      // normal fan-out; siblings on several rows = a stacked team.
      const siblings = team.filter((t) => t.parentKey === parentKey);
      const stacked = new Set(siblings.map((t) => t.y)).size > 1;
      const targetHandle =
        stacked && parent ? (n.x + NEST_W / 2 < parent.x + NEST_W / 2 ? "right" : "left") : "top";
      out.edges.push({
        id: `e-${idOf(n.key)}`,
        source: parentKey === member.key ? memberId : idOf(parentKey),
        target: idOf(n.key),
        targetHandle,
        type: "smoothstep",
        style: {
          stroke: manual
            ? AGENT_ORG_EDGE_KINDS.manual.color
            : accentClasses(accentOf.get(parentKey) ?? rootAccent).stroke,
          strokeWidth: 2,
          strokeDasharray: manual ? "7 6" : undefined,
        },
      });
    }
  }
  out.sig = sig.join("|");
  return out;
}

// ─── layout ─────────────────────────────────────────────────────────────

function defaultMemberPos(
  index: number,
  total: number,
  /** Tallest expanded team below any member; rows are spaced to clear it. */
  teamDrop = 0,
  /** Widest expanded team; columns are spaced to clear it. */
  teamSpan = 0,
): { x: number; y: number } {
  const cols = Math.min(Math.max(total, 1), 4);
  const col = index % cols;
  const row = Math.floor(index / cols);
  const spanX = Math.max(300, teamSpan + 40);
  const startX = -((cols - 1) * spanX) / 2;
  return { x: startX + col * spanX, y: 260 + row * (230 + teamDrop) };
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
function computeLayout(
  kind: LayoutKind,
  memberIds: string[],
  teamWidths: Record<string, number> = {},
  teamHeights: Record<string, number> = {},
): LayoutResult {
  const n = memberIds.length;
  const teamDrop = Math.max(0, ...Object.values(teamHeights));
  const teamSpan = Math.max(0, ...Object.values(teamWidths));

  if (kind === "grid") {
    const members: Record<string, XY> = {};
    memberIds.forEach((id, i) => (members[id] = defaultMemberPos(i, n, teamDrop, teamSpan)));
    return { orch: { x: -ORCH_W / 2, y: -40 }, members };
  }

  if (kind === "radial") {
    const members: Record<string, XY> = {};
    // Teams hang below their member, so the ring is widened to clear them.
    const R = Math.max(340, n * 48, teamSpan * 0.75 + teamDrop * 0.5);
    memberIds.forEach((id, i) => {
      const ang = (2 * Math.PI * i) / Math.max(n, 1) - Math.PI / 2;
      members[id] = { x: Math.cos(ang) * R - MEM_W / 2, y: Math.sin(ang) * R - MEM_H / 2 };
    });
    return { orch: { x: -ORCH_W / 2, y: -ORCH_H / 2 }, members };
  }

  // hierarchy — dagre top-down tree (conductor over its members)
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: 44, ranksep: 90, marginx: 24, marginy: 24 });
  g.setDefaultEdgeLabel(() => ({}));
  g.setNode(ORCH_ID, { width: ORCH_W, height: ORCH_H });
  // A member with an expanded team gets the team's width, so teams never overlap.
  memberIds.forEach((id) => g.setNode(id, { width: Math.max(MEM_W, teamWidths[id] ?? 0), height: MEM_H }));
  memberIds.forEach((id) => g.setEdge(ORCH_ID, id));
  dagre.layout(g);
  const on = g.node(ORCH_ID);
  const members: Record<string, XY> = {};
  memberIds.forEach((id) => {
    const dn = g.node(id);
    members[id] = { x: dn.x - MEM_W / 2, y: dn.y - MEM_H / 2 };
  });
  // Teams hang below their member; members stay on one row above them.
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

function CanvasInner({ conductorId, accent, members, config, onEditMember, onOpenConductor }: OrchestraBuilderCanvasProps) {
  const dispatch = useAppDispatch();
  const { screenToFlowPosition, fitView } = useReactFlow();
  const a = accentClasses(accent);

  // Nested teams: a member that leads its own Orchestra (or has agents placed
  // under it by hand) shows that whole tree beneath it, read-only.
  const { forest, orchestras } = useAgentOrgChart({ rootIds: [conductorId] });
  const [collapsedTeams, setCollapsedTeams] = useState<Set<string>>(() => new Set());
  const toggleTeam = (agentId: string) =>
    setCollapsedTeams((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) next.delete(agentId);
      else next.add(agentId);
      return next;
    });
  const memberCounts = new Map([...orchestras].map(([id, o]) => [id, o.members.length]));
  const nested = buildNestedGraph(
    forest[0],
    new Set(members.map((m) => m.agentId)),
    collapsedTeams,
    memberCounts,
    accent,
  );

  // Build the RF node list from props, preserving the live position + z-order of
  // nodes that already exist (so a drag or bring-to-front survives a reconcile).
  const buildNodes = useCallback(
    (prev: Node[] = []): Node[] => {
      const prevById = new Map(prev.map((n) => [n.id, n]));
      const op = prevById.get(ORCH_ID);
      const orch: Node = {
        id: ORCH_ID,
        type: "conductor",
        position: op?.position ?? config.conductorPos ?? { x: 0, y: 0 },
        zIndex: op?.zIndex,
        data: {
          agentId: conductorId,
          accent,
          memberCount: members.length,
          onOpen: onOpenConductor,
        } as Record<string, unknown>,
      };
      const memberNodes: Node[] = members.map((m, i) => {
        const p = prevById.get(m.agentId);
        return {
          id: m.agentId,
          type: "member",
          position:
            p?.position ??
            m.pos ??
            defaultMemberPos(
              i,
              members.length,
              Math.max(0, ...Object.values(nested.heights)),
              Math.max(0, ...Object.values(nested.widths)),
            ),
          zIndex: p?.zIndex,
          data: {
            conductorId,
            agentId: m.agentId,
            accent,
            index: i + 1,
            roleTitle: m.roleTitle,
            gap: m.gap,
            onEdit: onEditMember,
            teamSize: nested.teamSize[m.agentId] ?? 0,
            teamCollapsed: collapsedTeams.has(m.agentId),
            onToggleTeam: toggleTeam,
          } as Record<string, unknown>,
        };
      });
      return [orch, ...memberNodes, ...nested.nodes];
    },
    [members, config.conductorPos, accent, conductorId, onEditMember, onOpenConductor, nested, collapsedTeams, toggleTeam],
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
      `#${accent}#${JSON.stringify(config.conductorPos ?? null)}#${nested.sig}`,
    [members, accent, config.conductorPos, nested.sig],
  );

  useEffect(() => {
    // Sync external membership/label/accent changes into RF-owned state, keyed on
    // `sig`, preserving live positions/z-order (updater form — the compiler is fine
    // with it). See buildNodes note above.
    // Nested nodes are rebuilt every time (their positions are computed, never
    // dragged), so drop them from `cur` and let buildNodes append fresh ones.
    setNodes((cur) => buildNodes(cur.filter((n) => n.type !== "nested")));
    setEdges([
      ...members.map((m) => ({
        id: `e-${m.agentId}`,
        source: ORCH_ID,
        target: m.agentId,
        // Solid, not "animated": a dashed line means a MANUAL link (see the legend).
        type: "smoothstep",
        style: { stroke: a.stroke, strokeWidth: 2 },
      })),
      ...nested.edges,
    ]);
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
          saveOrchestraConfig({
            conductorId,
            config: { ...config, conductorPos: { x: node.position.x, y: node.position.y } },
          }),
        );
      } else {
        const m = members.find((x) => x.agentId === node.id);
        dispatch(
          saveMemberMeta({
            conductorId,
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
    [dispatch, conductorId, config, members],
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const agentId = event.dataTransfer.getData(AGENT_DND_MIME);
      if (!agentId || agentId === conductorId) return;
      if (members.some((m) => m.agentId === agentId)) return;
      const pos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      dispatch(addAgentToOrchestra({ conductorId, agentId, meta: { pos } }));
    },
    [dispatch, conductorId, members, screenToFlowPosition],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  // Auto-arrange: recompute every node's position, snap instantly (overrides),
  // persist (per-member pos + conductor pos), then frame the graph.
  const applyLayout = useCallback(
    (kind: LayoutKind) => {
      const layout = computeLayout(kind, members.map((m) => m.agentId), nested.widths, nested.heights);
      setNodes((nds) =>
        nds.map((n) =>
          n.id === ORCH_ID
            ? { ...n, position: layout.orch }
            : layout.members[n.id]
              ? { ...n, position: layout.members[n.id] }
              : n,
        ),
      );
      dispatch(saveOrchestraConfig({ conductorId, config: { ...config, conductorPos: layout.orch } }));
      members.forEach((m) =>
        dispatch(
          saveMemberMeta({ conductorId, agentId: m.agentId, meta: { pos: layout.members[m.agentId] } }),
        ),
      );
      // Frame after the position change has painted.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => fitView({ padding: 0.25, maxZoom: 1, duration: 400 })),
      );
    },
    [members, dispatch, conductorId, config, fitView, setNodes, nested.widths, nested.heights],
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
        className="orchestra-flow bg-textured"
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
        {Object.keys(nested.teamSize).length > 0 && (
          <Panel position="bottom-left" className="!ml-14">
            <div className="flex flex-col gap-1 rounded-lg border border-border bg-card/90 px-3 py-2 text-[11px] shadow-md backdrop-blur">
              <div className="flex items-center gap-2">
                <svg width="26" height="8" aria-hidden>
                  <line x1="1" y1="4" x2="25" y2="4" stroke={a.stroke} strokeWidth={2.5} strokeLinecap="round" />
                </svg>
                <span className="text-foreground">Solid — automatic (Orchestra, in its colour)</span>
              </div>
              <div className="flex items-center gap-2">
                <svg width="26" height="8" aria-hidden>
                  <line
                    x1="1"
                    y1="4"
                    x2="25"
                    y2="4"
                    stroke={AGENT_ORG_EDGE_KINDS.manual.color}
                    strokeWidth={2.5}
                    strokeDasharray="5 4"
                    strokeLinecap="round"
                  />
                </svg>
                <span className="text-foreground">Dashed — manual (recorded, not enforced)</span>
              </div>
            </div>
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}

export default function OrchestraBuilderCanvasImpl(props: OrchestraBuilderCanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
