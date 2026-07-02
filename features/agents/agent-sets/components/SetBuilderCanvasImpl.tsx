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

import { useCallback, useMemo, useState } from "react";
// eslint-disable-next-line no-restricted-syntax -- The ONE sanctioned React Flow import; this module is loaded only via the SetBuilderCanvas next/dynamic({ ssr:false }) wrapper (code-splitting skill + reactFlowStaticImportBan).
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  useReactFlow,
  type Node,
  type Edge,
  type NodeChange,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Network, Webhook, Pencil, X } from "lucide-react";
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

// ─── canvas ─────────────────────────────────────────────────────────────

function CanvasInner({ orchestratorId, accent, members, config, onEditMember }: SetBuilderCanvasProps) {
  const dispatch = useAppDispatch();
  const { screenToFlowPosition } = useReactFlow();
  const a = accentClasses(accent);

  // Live drag positions — updated ONLY from onNodesChange (an event handler), so
  // nodes derive from props without a setState-in-effect sync. Saved positions
  // (member.pos / config.orchestratorPos) seed the layout; the radial fallback
  // places anything unplaced.
  const [overrides, setOverrides] = useState<Record<string, { x: number; y: number }>>({});

  const nodes = useMemo<Node[]>(() => {
    const orch: Node = {
      id: ORCH_ID,
      type: "orchestrator",
      position: overrides[ORCH_ID] ?? config.orchestratorPos ?? { x: 0, y: 0 },
      data: {
        agentId: orchestratorId,
        accent,
        memberCount: members.length,
      } as Record<string, unknown>,
    };
    const memberNodes: Node[] = members.map((m, i) => ({
      id: m.agentId,
      type: "member",
      position: overrides[m.agentId] ?? m.pos ?? defaultMemberPos(i, members.length),
      data: {
        orchestratorId,
        agentId: m.agentId,
        accent,
        index: i + 1,
        roleTitle: m.roleTitle,
        gap: m.gap,
        onEdit: onEditMember,
      } as Record<string, unknown>,
    }));
    return [orch, ...memberNodes];
  }, [orchestratorId, accent, members, config.orchestratorPos, overrides, onEditMember]);

  const edges = useMemo<Edge[]>(
    () =>
      members.map((m) => ({
        id: `e-${m.agentId}`,
        source: ORCH_ID,
        target: m.agentId,
        animated: true,
        type: "smoothstep",
        style: { stroke: a.stroke, strokeWidth: 2 },
      })),
    [members, a.stroke],
  );

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setOverrides((prev) => {
      let next = prev;
      for (const c of changes) {
        if (c.type === "position" && c.position) {
          if (next === prev) next = { ...prev };
          next[c.id] = c.position;
        }
      }
      return next;
    });
  }, []);

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

  return (
    <div className="h-full w-full" onDrop={onDrop} onDragOver={onDragOver}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={onNodeDragStop}
        nodesConnectable={false}
        edgesFocusable={false}
        deleteKeyCode={null}
        fitView
        fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
        proOptions={{ hideAttribution: true }}
        className="bg-textured"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} className="opacity-50" />
        <Controls showInteractive={false} className="!shadow-md" />
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
